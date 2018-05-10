import {readdir, readFile} from 'fs'
import {join} from 'path'

import * as minimist from 'minimist'
import {Connection} from 'sqlcmd-pg'

export interface PatchRow {
  filename: string
  applied: Date
}

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

@param db - A sqlcmd.Connection instance.
@param patches_table - The name of the table to (created if needed), which will
                       record the application of patches onto the database.
@param patches_dirpath - The directory containing .sql files to run as patches
@param callback - Called whenever an error occurs, or all patches have been
                  executed successfully.
*/
export function executePatches(db: Connection, patches_table: string, patches_dirpath: string,
                               callback: (error: Error, filenames?: string[]) => void) {
  db.CreateTable(patches_table)
  .ifNotExists()
  .add(
    'filename TEXT NOT NULL',
    'applied TIMESTAMP DEFAULT current_timestamp NOT NULL'
  )
  .execute(createTableErr => {
    if (createTableErr) return callback(createTableErr)
    readdir(patches_dirpath, (readdirErr, filenames) => {
      if (readdirErr) return callback(readdirErr)

      db.Select(patches_table)
      .execute((selectErr, patches: PatchRow[]) => {
        if (selectErr) return callback(selectErr)
        const applied_filenames: string[] = patches.map(patch => patch.filename)

        const unapplied_filenames = filenames.filter(filename => {
          return applied_filenames.indexOf(filename) === -1 && filename.match(/\.sql$/)
        }).sort()

        const newly_applied_filenames: string[] = []

        // this could be an IIFE but TypeScript balks
        function loop() {
          const unapplied_filename = unapplied_filenames.shift()
          if (unapplied_filename === undefined) {
            // no more filenames we're finished!
            return callback(null, newly_applied_filenames)
          }
          else {
            const unapplied_filepath = join(patches_dirpath, unapplied_filename)
            readFile(unapplied_filepath, {encoding: 'utf8'}, (readFileErr, file_contents) => {
              if (readFileErr) return callback(readFileErr)

              db.executeSQL(file_contents, [], executeSQLErr => {
                if (executeSQLErr) return callback(executeSQLErr)

                db.Insert(patches_table)
                .set({filename: unapplied_filename})
                .execute(insertErr => {
                  if (insertErr) return callback(insertErr)

                  newly_applied_filenames.push(unapplied_filename)
                  loop()
                })
              })
            })
          }
        }
        loop()
      })
    })
  })
}

function printUsageAndExit(error?: string) {
  console.error('Usage: sql-patch /path/to/patches/ <variable database config options> [--name _schema_patches]')
  if (error) {
    console.error()
    console.error(error)
  }
  process.exit(error ? 1 : 0)
}

/**
Command line interface (CLI) entry point.
Parses `process.argv` and runs `executePatches` with the specified options.
*/
export function main() {
  const argv = minimist(process.argv.slice(2), {
    boolean: ['help', 'version'],
    default: {
      name: '_schema_patches',
    },
    alias: {
      help: 'h',
      version: 'v',
    },
  })

  const {help, version,
         name: patches_table,
         database, user, password, host, port, ssl} = argv
  const [patches_dirpath] = argv._

  if (help) {
    printUsageAndExit()
  }
  else if (version) {
    console.log(require('./package').version)
  }
  else {
    if (!database) {
      printUsageAndExit('Must provide database name with --database argument.')
    }

    const db = new Connection({database, user, password, host, port, ssl})

    db.on('log', ev => {
      console.error(`[${ev.level}] ${ev.format}`, ev.args)
    })

    db.createDatabaseIfNotExists((createDatabaseErr, created) => {
      if (createDatabaseErr) {
        return printUsageAndExit(createDatabaseErr.toString())
      }

      if (created) {
        console.error(`Created database "${database}".`)
      }
      else {
        console.error(`Database "${database}" already exists.`)
      }

      console.error(`Executing patches from "${patches_dirpath}" and recording in "${patches_table}".`)

      executePatches(db, patches_table, patches_dirpath, (executeErr, filenames) => {
        if (executeErr) {
          return printUsageAndExit(executeErr.toString())
        }

        if (filenames.length > 0) {
          console.error('Applied patches:')
          filenames.forEach(filename => {
            console.log(`  ${filename}`)
          })
        }
        else {
          console.error('Database is already up-to-date; no patches applied.')
        }

        process.exit()
      })
    })
  }
}
