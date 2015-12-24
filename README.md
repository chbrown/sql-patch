# sql-patch

Up/down migrations with some arbitrary DSL/ORM are tedious.

This library (and command line script) provides a tool for applying all of the SQL commands in some directory in order, idempotently. I.e., given a database name and directory:

1. Create the database (if needed)
2. Create a table to track the patches that have been applied (if needed)
3. Read the `*.sql` files from the directory and execute them in order if they haven't been executed before
4. Record which files have been executed, so that subsequent calls won't execute them again

It's simpler than typical (say, Rails) migrations. Patches are one-way, and SQL only.


## CLI example

Create a new database if needed: `createdb buyersdb` (only PostgreSQL for now; see [To-do](#to-do) below)

`migrations/01-initial.sql`:

    CREATE TABLE customer (
      id SERIAL PRIMARY KEY,
      fullname TEXT,
      created TIMESTAMP DEFAULT current_timestamp
    );
    INSERT INTO customer (fullname) VALUES ('Lance Moore'), ('Phil Lester');

Running `sql-patch migrations/ --database buyersdb` will create a new table, if needed, to track migration execution. This meta-table will be created in the "buyersdb" database itself, and by default is named "\_schema\_patches". It will then execute the contents of the `migrations/01-initial.sql` file as a single query in that database.

Our table now looks like this:

| id | fullname    | created
|:---|:------------|:-------------------
| 1  | Lance Moore | 2015-12-23 21:45:09
| 2  | Phil Lester | 2015-12-23 21:45:09

Running `sql-patch migrations/ --database buyersdb` again will have no effect, even if you change the contents of `01-initial.sql`. Thus you should never change the contents of a migration once it's been used.

Suppose we later decide a single "fullname" field is sloppy.

`migrations/02-split-name.sql`:

    ALTER TABLE customer
      ADD COLUMN firstname TEXT,
      ADD COLUMN lastname TEXT;
    UPDATE customer SET firstname = substring(fullname from '(.*) '),
                        lastname  = substring(fullname from ' (.*)');
    ALTER TABLE customer DROP COLUMN fullname;

Running `sql-patch migrations/ --database buyersdb` now will read the "\_schema\_patches" table, find that `02-split-name.sql` has not been applied, and run it.

Our amended table now looks like this:

| id | created             | firstname | lastname
|:---|:--------------------|:----------|:--------
| 1  | 2015-12-23 21:45:09 | Lance     | Moore
| 2  | 2015-12-23 21:45:09 | Phil      | Lester


## API example

This example does pretty much the same thing, even creating the database if needed, from a Node.js script.

    const path = require('path');
    const Connection = require('sqlcmd-pg').Connection;
    const sqlPatch = require('sql-patch');

    const db = new Connection({
      user: 'postgres',
      database: 'buyersdb',
    });

    db.createDatabaseIfNotExists(function(err) {
      if (err) throw err;

      var patches_dirpath = path.join(__dirname, 'migrations');
      sqlPatch.executePatches(db, '_schema_patches', patches_dirpath, function(err) {
        if (err) throw err;

        console.log('DONE');
        process.exit();
      });
    });


## To-do

* [ ] Support engines other than PostgreSQL
* [ ] Run each patch within a transaction (if supported by the engine)


## License

Copyright 2015 Christopher Brown. [MIT Licensed](http://chbrown.github.io/licenses/MIT/#2015)
