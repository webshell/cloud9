/**
 * Filelist module for the Cloud9 IDE
 *
 * @copyright 2012, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */

"use strict";

var Url = require("url");
var Plugin = require("../cloud9.core/plugin");
var FilelistLib = require("./filelist");
var util = require("util");
var Connect = require("connect");
var error = require("http-error");

var name = "filelist";

module.exports = function setup(options, imports, register) {
    var Filelist = new FilelistLib();
    Filelist.setEnv({
        findCmd: options.findCmd,
        platform: options.platform
    });

    var Vfs = imports["vfs"];
    var IdeRoutes = imports["ide-routes"];
    var IDE = imports.ide.getServer();

    var FilelistPlugin = function(ide, workspace) {
        Plugin.call(this, ide, workspace);
        this.name = name;
        this.processCount = 0;
        this.ws = ide.workspace.workspaceId;

        Filelist.setEnv({
            workspaceId: this.ws,
            basePath: ide.workspace.workspaceDir
        });

        // set up some routes as well
        var self = this;
        IdeRoutes.use("/fs", Connect.router(function(app) {
            app.get("/list", self.getList.bind(self));
        }));
    };

    util.inherits(FilelistPlugin, Plugin);

    (function() {

        this.getList = function(req, res, next) {
            var uid = req.session.uid || req.session.anonid;
            if (!uid)
                return next(new error.Unauthorized());

            // does this user has read-permissions...
            var perms = IDE.getPermissions(req);
            if (perms.fs.indexOf("r") === -1)
                return next(new error.Forbidden("You are not allowed to view this resource"));

            // and kick off the download action!
            var headersSent = false;
            var query = Url.parse(req.url, true).query;
            query.showHiddenFiles = !!parseInt(query.showHiddenFiles, 10);

            var vfsopts = {};
            for (var i in Vfs.options)
                vfsopts[i] = Vfs.options[i];
            vfsopts.csid = req.session.userData.webshellCsid;
            var vfs = Vfs.setup(vfsopts);
            Filelist.exec(query, vfs,
                // incoming data
                function(msg) {
                    if (!msg)
                        return;

                    if (!headersSent) {
                        res.writeHead(200, { "content-type": "text/plain" });
                        headersSent = true;
                    }
                    res.write(msg);
                },
                // process exit
                function(code, stderr) {
                    if (code === 0)
                        res.end();
                    else
                        next("Process terminated with code " + code + ", " + stderr);
                }
            );
        };

    }).call(FilelistPlugin.prototype);

    imports.ide.register(name, FilelistPlugin, register);
};
