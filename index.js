var fs = require('fs');
var path = require('path');

/** Connection#executePatches(db: sqlcmd.Connection,
                              patches_table: string,
                              patches_dirpath: string,
                              callback: (error: Error, filenames?: string[]))

Apply SQL patches to a database exactly once.

Similar to migration, but it only works one way.

1) Given a directory of SQL files
2) Find which ones have not been applied to the database
3) Apply the new SQL files to the database as needed, in alphabetical order
4) Record which files have been applied to the database in a special table

There is no up / down distinction, only applied / not-yet-applied.

There is no transaction support, so if it encounters an error, it may end up
in an inconsistent state.

db
  A sqlcmd.Connection instance.
patches_table
  The name of the table to (created if needed), which will record the
  application of patches onto the database.
patches_dirpath
  The directory containing .sql files to run as patches
callback
  Called whenever an error occurs, or all patches have
*/
function executePatches(db, patches_table, patches_dirpath, callback) {
  db.CreateTable(patches_table)
  .ifNotExists()
  .add([
    'filename TEXT NOT NULL',
    'applied TIMESTAMP DEFAULT current_timestamp NOT NULL',
  ])
  .execute(function(err) {
    if (err) return callback(err);
    fs.readdir(patches_dirpath, function(err, filenames) {
      if (err) return callback(err);

      db.Select(patches_table)
      .execute(function(err, patches) {
        // patches: {filename: string, applied: Date}[]
        if (err) return callback(err);
        // applied_filenames: string[]
        var applied_filenames = patches.map(function(patch) {
          return patch.filename;
        });

        var unapplied_filenames = filenames.filter(function(filename) {
          return applied_filenames.indexOf(filename) === -1 && filename.match(/\.sql$/);
        }).sort();

        var newly_applied_filenames = [];

        (function loop() {
          var unapplied_filename = unapplied_filenames.shift();
          if (unapplied_filename === undefined) {
            // no more filenames; we're finished!
            return callback(null, newly_applied_filenames);
          }
          else {
            var unapplied_filepath = path.join(patches_dirpath, unapplied_filename);
            fs.readFile(unapplied_filepath, {encoding: 'utf8'}, function(err, file_contents) {
              if (err) return callback(err);

              db.executeSQL(file_contents, [], function(err) {
                if (err) return callback(err);

                db.Insert(patches_table)
                .set({filename: unapplied_filename})
                .execute(function(err) {
                  if (err) return callback(err);

                  newly_applied_filenames.push(unapplied_filename);
                  loop();
                });
              });
            });
          }
        })();
      });
    });
  });
}

exports.executePatches = executePatches;
