# sql-patch

Up/down migrations with some arbitrary DSL/ORM are tedious.

This library (and command line script) provides a tool for applying all of the SQL commands in some directory in order, idempotently. I.e., given a database name and directory:

1. Create the database (if needed)
2. Create a table to track the patches that have been applied (if needed)
3. Read the `*.sql` files from the directory and execute them in order if they haven't been executed before
4. Record which files have been executed, so that subsequent calls won't execute them again

It's simpler than typical (say, Rails) migrations. Patches are one-way, and SQL only.


## To-do

* [ ] Support engines other than PostgreSQL
* [ ] Run each patch within a transaction (if supported by the engine)


## License

Copyright 2015 Christopher Brown. [MIT Licensed](http://chbrown.github.io/licenses/MIT/#2015)
