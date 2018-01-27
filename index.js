const fs = require('fs')
const path = require('path')

/**
Apply SQL patches to a database exactly once.

Similar to migration, but it only works one way.

1) Given a directory of SQL files
2) Find which ones have not been applied to the database
3) Apply the new SQL files to the database as needed, in alphabetical order
4) Record which files have been applied to the database in a special table

There is no up / down distinction, only applied / not-yet-applied.

There is no transaction support, so if it encounters an error, it may end up
in an inconsistent state.

@param {sqlcmd.Connection} db - A sqlcmd.Connection instance.
@param {string} patches_table - The name of the table to (created if needed), which will record the application of patches onto the database.
@param {string} patches_dirpath - The directory containing .sql files to run as patches
@param {function} callback - Called whenever an error occurs, or all patches have been executed successfully.
                  callback: (error: Error, filenames?: string[]) => void
*/
function executePatches(db, patches_table, patches_dirpath, callback) {
  db.CreateTable(patches_table)
  .ifNotExists()
  .add(
    'filename TEXT NOT NULL',
    'applied TIMESTAMP DEFAULT current_timestamp NOT NULL'
  )
  .execute(err => {
    if (err) return callback(err)
    fs.readdir(patches_dirpath, (err, filenames) => {
      if (err) return callback(err)

      db.Select(patches_table)
      .execute((err, patches) => {
        // patches: {filename: string, applied: Date}[]
        if (err) return callback(err)
        // applied_filenames: string[]
        const applied_filenames = patches.map(patch => patch.filename)

        const unapplied_filenames = filenames.filter(filename => {
          return applied_filenames.indexOf(filename) === -1 && filename.match(/\.sql$/)
        }).sort()

        const newly_applied_filenames = []

        (function loop() {
          const unapplied_filename = unapplied_filenames.shift()
          if (unapplied_filename === undefined) {
            // no more filenames we're finished!
            return callback(null, newly_applied_filenames)
          }
          else {
            const unapplied_filepath = path.join(patches_dirpath, unapplied_filename)
            fs.readFile(unapplied_filepath, {encoding: 'utf8'}, (err, file_contents) => {
              if (err) return callback(err)

              db.executeSQL(file_contents, [], err => {
                if (err) return callback(err)

                db.Insert(patches_table)
                .set({filename: unapplied_filename})
                .execute(err => {
                  if (err) return callback(err)

                  newly_applied_filenames.push(unapplied_filename)
                  loop()
                })
              })
            })
          }
        })()
      })
    })
  })
}

exports.executePatches = executePatches
