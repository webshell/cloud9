/**
 * Filelist module for the Cloud9 IDE
 *
 * @copyright 2012, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */

"use strict";

var Os = require("os");
var Path = require("path");

module.exports = function() {
    this.env = {
        findCmd: "find",
        platform: Os.platform(),
        basePath: "",
        workspaceId: ""
    };

    this.setEnv = function(newEnv) {
        var self = this;
        Object.keys(this.env).forEach(function(e) {
            if (newEnv[e])
                self.env[e] = newEnv[e];
        });
    };

    this.exec = function(options, vfs, onData, onExit) {
        var path = options.path;

        if (options.path === null)
            return onExit(1, "Invalid path");

        options.uri = path;
        options.path = Path.normalize(this.env.basePath + (path ? "/" + path : ""));
        // if the relative path FROM the workspace directory TO the requested path
        // is outside of the workspace directory, the result of Path.relative() will
        // start with '../', which we can trap and use:
        if (Path.relative(this.env.basePath, options.path).indexOf("../") === 0)
            return onExit(1, "Invalid path");

        var args = this.assembleCommand(options);

        if (!args)
            return onExit(1, "Invalid arguments");

        vfs.spawn("return find(args)", { args: args }, function(err, data) {
            if (err || ! Array.isArray(data))
                return onExit(1, err);

            for (var i in data)
                onData("./" + Path.relative(options.path, data[i]) + "\n");
            onExit(0);
        });
    };

    this.assembleCommand = function(options) {
        var excludeExtensions = [
            "\\.gz", "\\.bzr", "\\.cdv", "\\.dep", "\\.dot", "\\.nib",
            "\\.plst", "_darcs", "_sgbak", "autom4te\\.cache", "cover_db",
            "_build", "\\.tmp"
        ];

        var excludeDirectories = [
            "\\.c9revisions", "\\.architect", "\\.sourcemint",
            "\\.git", "\\.hg", "\\.pc", "\\.svn", "blib",
            "CVS", "RCS", "SCCS", "\\.DS_Store"
        ];

        var args = {path:options.path, exclude:[]};

        //Hidden Files
        if (!options.showHiddenFiles)
            args.exclude.push(".*/\\..*");

        if (options.maxdepth)
            args.depth = options.maxdepth;

        excludeExtensions.forEach(function(pattern){
            args.exclude.push(".*\\/" + pattern + "$");
        });

        excludeDirectories.forEach(function(pattern){
            args.exclude.push(".*\\/" + pattern + "\\/.*");
        });

        return args;
    };
};
