import {Connection} from 'sqlcmd';

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
export declare function executePatches(db: Connection,
                                       patches_table: string,
                                       patches_dirpath: string,
                                       callback: (error: Error, filenames?: string[]) => void): void;
