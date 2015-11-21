import co from 'co';
import { Schema } from 'chaos-database';
import PostgreSql from '../../src';
import { Dialect } from 'sql-dialect';

Promise = require('bluebird');

function getConnection() {
  return new PostgreSql({
    database: 'chaos_test',
    username: 'postgres'
  });
}

describe("PostgreSql", function() {

  before(function() {
    this.connection = getConnection();
  });

  describe(".constructor()", function() {

    it("allows to inject a dialect instance", function() {

      var dialect = new Dialect();
      var connection = new PostgreSql({ dialect: dialect });

      expect(connection.dialect()).toBe(dialect);

    });

    it("correctly sets up a default dialect instance.", function() {

      var dialect = this.connection.dialect();

      expect(dialect.quote('tablename')).toBe("'tablename'");

      expect(dialect.value('string_value', {
        name: 'string_field',
        type: function(name) {
          if (name === 'string_field') {
            return 'string';
          }
        }
      })).toBe("'string_value'");

    });

  });

  describe(".enabled()", function() {

    it("returns `true` for enabled features, false otherwise.", function() {

      expect(PostgreSql.enabled()).toEqual({
        arrays: true,
        transactions: true,
        booleans: true
      });
      expect(PostgreSql.enabled('arrays')).toBe(true);
      expect(PostgreSql.enabled('transactions')).toBe(true);
      expect(PostgreSql.enabled('booleans')).toBe(true);

    });

  });

  describe(".connect()", function() {

    it("fails when it can't connect", function(done) {

      var connection = new PostgreSql({
        host: 'hostlocal',
        database: 'chaos_test',
        username: 'root',
        password: 'root'
      });
      connection.connect().then(function() {
        expect(false).toBe(true);
      }).catch(function(err) {
        expect(err.message).toMatch(/Unable to connect to host/);
        done();
      });

    });

    it("throws an exception if no database name is set", function(done) {

      new PostgreSql().connect().then(function() {
        expect(false).toBe(true);
      }).catch(function(err) {
        expect(err.message).toMatch(/Error, no database name has been configured./);
        done();
      });

    });

    it("returns the same connection when called multiple times.", function(done) {

      co(function*() {
        var expected = yield this.connection.connect();

        var actual = yield this.connection.connect();
        expect(actual).toBe(expected);

        actual = yield this.connection.connect();
        expect(actual).toBe(expected);
      }.bind(this)).then(function() {
        done();
      });

    });

  });

  describe(".client()", function() {

    it("returns the connected client.", function(done) {

      co(function*() {
        var connection = new getConnection();
        expect(connection.client()).toBe(undefined);
        yield connection.connect();
        expect(connection.client()).toBeAn('object');
      }.bind(this)).then(function() {
        done();
      });

    });

  });

  describe(".connected()", function() {

    it("returns `true` when connected.", function() {

      expect(this.connection.connected()).toBe(true);

    });

    it("returns `false` when not connected.", function() {

      var connection = new PostgreSql();
      expect(connection.connected()).toBe(false);

    });

  });

  describe(".query()", function() {

    it("rejects the promise when an error occurs.", function(done) {

      co(function*() {
        var response = yield this.connection.query("SELECT * FROM");
        expect(client).toBeAn('object');
      }.bind(this)).then(function() {
        expect(false).toBe(true);
      }).catch(function(err) {
        expect(err.message).toMatch(/syntax error at end of input/);
        done();
      });

    });

  });

  describe(".sources()", function() {

    it("shows sources", function(done) {

      co(function*() {
        var schema = new Schema({ connection: this.connection });
        schema.source('gallery');
        schema.set('id', { type: 'serial' });
        yield schema.create();

        var sources = yield this.connection.sources();

        expect(sources).toEqual({
          gallery: 'gallery'
        });

        yield schema.drop();
      }.bind(this)).then(function() {
        done();
      });
    });

  });

  describe(".describe()", function() {

    beforeEach(function() {

      this.schema = new Schema();
      this.schema.source('gallery');
      this.schema.set('id', { type: 'serial' });
      this.schema.set('name', {
        type: 'string',
        length: 128,
        'default': 'Johnny Boy'
      });
      this.schema.set('active', {
        type: 'boolean',
        'default': true
      });
      this.schema.set('inactive', {
        type: 'boolean',
        'default': false
      });
      this.schema.set('money', {
        type: 'decimal',
        length: 10,
        precision: 2
      });
      this.schema.set('created', {
        type: 'datetime',
        use: 'timestamp',
        'default': { ':plain': 'CURRENT_TIMESTAMP' }
      });

    });

    it("describe a source", function(done) {

      co(function*() {
        this.schema.connection(this.connection);
        yield this.schema.create();

        var gallery = yield this.connection.describe('gallery');

        expect(gallery.field('id')).toEqual({
          use: 'integer',
          type: 'integer',
          null: false,
          'default': null,
          array: false
        });

        expect(gallery.field('name')).toEqual({
          use: 'character varying',
          type: 'string',
          length: 128,
          null: true,
          'default': 'Johnny Boy',
          array: false
        });

        expect(gallery.field('active')).toEqual({
          use: 'boolean',
          type: 'boolean',
          null: true,
          'default': true,
          array: false
        });

        expect(gallery.field('inactive')).toEqual({
          use: 'boolean',
          type: 'boolean',
          null: true,
          'default': false,
          array: false
        });

        expect(gallery.field('money')).toEqual({
          use: 'numeric',
          type: 'decimal',
          length: 10,
          precision: 2,
          null: true,
          'default': null,
          array: false
        });

        expect(gallery.field('created')).toEqual({
          use: 'timestamp without time zone',
          type: 'datetime',
          length: 6,
          null: true,
          'default': null,
          array: false
        });

        yield this.schema.drop();
      }.bind(this)).then(function() {
        done();
      });

    });

    it("creates a schema instance without introspection", function(done) {

      co(function*() {

        var gallery = yield this.connection.describe('gallery', this.schema.fields());

        expect(gallery.field('id')).toEqual({
          type: 'serial',
          null: false,
          array: false
        });

        expect(gallery.field('name')).toEqual({
          type: 'string',
          length: 128,
          null: true,
          'default': 'Johnny Boy',
          array: false
        });

        expect(gallery.field('active')).toEqual({
          type: 'boolean',
          null: true,
          'default': true,
          array: false
        });

        expect(gallery.field('inactive')).toEqual({
          type: 'boolean',
          null: true,
          'default': false,
          array: false
        });

        expect(gallery.field('money')).toEqual({
          type: 'decimal',
          length: 10,
          precision: 2,
          null: true,
          array: false
        });

        expect(gallery.field('created')).toEqual({
          use: 'timestamp',
          type: 'datetime',
          null: true,
          array: false,
          'default': { ':plain': 'CURRENT_TIMESTAMP' }
        });
      }.bind(this)).then(function() {
        done();
      });

    });

  });

  describe(".lastInsertId()", function() {

    it("gets the encoding last insert ID", function(done) {

      co(function*() {
        var schema = new Schema({ connection: this.connection });
        schema.source('gallery');
        schema.set('id',   { type: 'serial' });
        schema.set('name', { type: 'string' });
        yield schema.create();

        yield schema.insert({ name: 'new gallery' });
        expect(schema.lastInsertId()).toBe('1');

        yield schema.drop();
      }.bind(this)).then(function() {
        done();
      });

    });

  });

  describe(".disconnect()", function() {

    it("disconnects the client.", function(done) {

      co(function*() {
        var connection = getConnection();

        expect(connection.disconnect()).toBe(true);
        expect(connection.connected()).toBe(false);

        yield connection.connect();
        expect(connection.connected()).toBe(true);

        expect(connection.disconnect()).toBe(true);
        expect(connection.connected()).toBe(false);

      }.bind(this)).then(function() {
        done();
      });

    });

  });

});
