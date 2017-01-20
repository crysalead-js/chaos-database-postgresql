var co = require('co');
var pg = require('pg');
var extend = require('extend-merge').extend;
var merge = require('extend-merge').merge;
var Database = require('chaos-database').Database;
var PostgreSqlDialect = require('sql-dialect').PostgreSql;

/**
 * PostgreSQL adapter
 */
class PostgreSql extends Database {
  /**
   * Check for required PHP extension, or supported database feature.
   *
   * @param  String  feature Test for support for a specific feature, i.e. `"transactions"`
   *                         or `"arrays"`.
   * @return Boolean         Returns `true` if the particular feature is supported, `false` otherwise.
   */
  static enabled(feature) {
    var features = {
      arrays: true,
      transactions: true,
      booleans: true,
      default: true
    };
    if (!arguments.length) {
      return extend({}, features);
    }
    return features[feature];
  }

  /**
   * Constructs the PostgreSQL adapter and sets the default port to 3306.
   *
   * @param Object config Configuration options for this class. Available options
   *                      defined by this class:
   *                      - `'host'`: _string_ The IP or machine name where PostgreSQL is running,
   *                                  followed by a colon, followed by a port number or socket.
   *                                  Defaults to `'localhost'`.
   */
  constructor(config) {
    var defaults = {
      classes: {
        dialect: PostgreSqlDialect
      },
      host: 'localhost',
      port: 5432,
      schema: 'public',
      alias: true,
      client: undefined,
      dialect: true
    };
    config = merge({}, defaults, config);
    super(config);

    /**
     * Specific value denoting whether or not table aliases should be used in DELETE and UPDATE queries.
     *
     * @var Boolean
     */
    this._alias = config.alias;

    /**
     * Stores a connection to a remote resource.
     *
     * @var Function
     */
    this._client = config.client;

    /**
     * Whether the client is connected or not.
     *
     * @var Boolean
     */
    this._connected = false;

    /**
     * The SQL dialect instance.
     *
     * @var Function
     */
    var dialect = this.classes().dialect;

    if (typeof this._dialect === 'object') {
      return;
    }

    this._dialect = new dialect({
      caster: function(value, states) {
        var type;
        if (states && states.schema) {
          type = states.schema.type(states.name);
        }
        type = type ? type : this.constructor.getType(value);
        return this.convert('datasource', type, value);
      }.bind(this)
    });
  }

  /**
   * Returns the client instance.
   *
   * @return Function
   */
  client() {
    return this._client;
  }

  /**
   * Connects to the database using the options provided to the class constructor.
   *
   * @return boolean Returns `true` if a database connection could be established,
   *                 otherwise `false`.
   */
  connect() {
    if (this._client) {
      return Promise.resolve(this._client);
    }

    var config = this.config();

    if (!config.database) {
      return Promise.reject(new Error('Error, no database name has been configured.'));
    }

    var self = this;

    return new Promise(function(accept, reject) {
      var connectionString = config.username + (config.password ? ':' + config.password : '');
      connectionString += '@' + config.host + ':' + String(config.port) + '/' + config.database;
      var client = new pg.Client("postgres://" + connectionString);
      self._client = client;
      client.connect(function(err) {
        if (err) {
          return reject(new Error('Unable to connect to host , error ' + err.code + ' ' + err.stack));
        }
        self._connected = true;
        accept(client)
      });
    });
  }

  /**
   * Checks the connection status of this data source.
   *
   * @return Boolean Returns a boolean indicating whether or not the connection is currently active.
   *                 This value may not always be accurate, as the connection could have timed out or
   *                 otherwise been dropped by the remote resource during the course of the request.
   */
  connected() {
    return this._connected;
  }

  /**
   * Finds records using a SQL query.
   *
   * @param  string sql  SQL query to execute.
   * @param  array  data Array of bound parameters to use as values for query.
   *                     WARNING data must be clean at this step. SQL injection must be handled earlier.
   * @return object      A `Cursor` instance.
   */
  query(sql, data, options) {
    var self = this;

    return new Promise(function(accept, reject) {
      var defaults = {};
      options = extend({}, defaults, options);

      var cursor = self.constructor.classes().cursor;

      self.connect().then(function() {
        self._client.query(sql, function(err, data) {
          if (err) {
            return reject(err);
          }
          if (sql.match(/^INSERT/i)) {
            self._client.query('SELECT lastval()', function(err, data) {
              if (err) {
                return reject(err);
              }
              self._lastInsertId = data.rows[0] ? data.rows[0].lastval : undefined;
              accept(true);
            });
          } else if (sql.match(/^(UPDATE|DELETE)/i)) {
            accept(true);
          } else {
            accept(data && data.rows ? new cursor({ data: data.rows }) : true);
          }
        });
      })
    });
  }

  /**
   * Returns the last insert id from the database.
   *
   * @return mixed Returns the last insert id.
   */
  lastInsertId() {
    return this._lastInsertId;
  }

  /**
   * Returns the list of tables in the currently-connected database.
   *
   * @return Object Returns an object of sources to which models can connect.
   */
  sources() {
    var select = this.dialect().statement('select');
    select.fields('table_name')
      .from({ information_schema: ['tables'] })
      .where([
         { table_type: 'BASE TABLE' },
         { table_schema: this._config.schema }
      ]);
    return this._sources(select);
  }

  /**
   * Extracts fields definitions of a table.
   *
   * @param  String name The table name.
   * @return Object      The fields definitions.
   */
  fields(name) {
    return co(function*() {
      var tmp, fields = [];
      var select = this.dialect().statement('select');
      select.fields([
        { column_name: 'name' },
        { data_type: 'use' },
        { is_nullable: 'null' },
        { column_default: 'dflt' },
        { character_maximum_length: 'length' },
        { numeric_precision: 'numeric_length' },
        { numeric_scale: 'precision' },
        { datetime_precision: 'date_length' }
      ])
      .from({ information_schema: ['columns'] })
      .where({
        table_name: name,
        table_schema: this._config.schema
      });
      var columns = yield this.query(select.toString());
      for (var column of columns) {
        var dflt = column.dflt != null ? column.dflt : null;
        var field = this._field(column);

        switch (field.type) {
          case 'string':
            var matches = dflt.match(/^'(.*)'::/);
            if (matches) {
              dflt = matches[1];
            }
            break;
          case 'boolean':
            dflt = dflt === 'true';
            break;
          case 'integer':
            dflt = Number(Number.parseFloat(dflt)) === dflt ? dflt : null;
            break;
          case 'datetime':
            dflt = dflt !== 'now()' ? dflt : null;
            break;
        }

        tmp = {};
        tmp[column.name] = extend({}, {
          null: (column.null === 'YES' ? true : false),
          'default': dflt
        }, field);

        fields.push(tmp);
      }
      return fields;
    }.bind(this));
  }

  /**
   * Converts database-layer column to a generic field.
   *
   * @param  Object column Database-layer column.
   * @return Object        A generic field.
   */
  _field(column) {
    var use = column.use;
    var field = { use: use };

    if (column.length) {
      field.length = column.length;
    } else if (column.date_length) {
      field.length = column.date_length;
    } else if (use === 'numeric' && column.numeric_length) {
      field.length = column.numeric_length;
    }
    if (column.precision) {
      field.precision = column.precision;
    }
    field.type = this.dialect().mapped(field);
    return field;
  }

  /**
   * Disconnects the adapter from the database.
   *
   * @return Boolean Returns `true` on success, else `false`.
   */
  disconnect() {
    if (!this._client) {
      return true;
    }
    this._client.end();
    this._client = undefined;
    this._connected = false;
    return true;
  }
}

module.exports = PostgreSql;
