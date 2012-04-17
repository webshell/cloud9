var assert = require("assert");
var utils = require("connect").utils;

var IdeServer = require("./ide");

module.exports = function setup(options, imports, register) {

    assert(options.fsUrl, "option 'fsUrl' is required");

    var log = imports.log;
    var hub = imports.hub;
    var connect = imports.connect;
    var permissions = imports["workspace-permissions"];

    var sandbox = imports.sandbox;
    var baseUrl = options.baseUrl || "";
    var staticPrefix = imports.static.getStaticPrefix();

    var ide;
    var serverPlugins = {};

    sandbox.getProjectDir(function(err, projectDir) {
        if (err) return register(err);
        sandbox.getWorkspaceId(function(err, workspaceId) {
            if (err) return register(err);
            init(projectDir, workspaceId);
        });
    });

    function initUserAndProceed(uid, callback) {
        permissions.getPermissions(uid, function(err, perm) {
            if (err) {
                callback(err);
                return;
            }
            ide.addUser(uid, perm);
            callback(null);
        });
    }

    function init(projectDir, workspaceId, settingsPath) {
        ide = new IdeServer({
            workspaceDir: projectDir,
            settingsPath: settingsPath,
            davPrefix: baseUrl + "/workspace",
            baseUrl: baseUrl,
            debug: false,
            staticUrl: staticPrefix,
            workspaceId: workspaceId,
            name: options.name || workspaceId,
            version: options.version || null,
            requirejsConfig: {
                baseUrl: staticPrefix,
                paths: imports.static.getRequireJsPaths()
            },
            plugins: options.clientPlugins || [],
            bundledPlugins: options.bundledPlugins || []
        });

        register(null, {
            ide: {
                register: function(name, plugin, callback) {
                    log.info("IDE SERVER PLUGIN: ", name);
                    serverPlugins[name] = plugin;
                    callback();
                },
                getServer: function() {
                    return ide;
                },
                initUserAndProceed: initUserAndProceed
            }
        });
    }

    hub.on("containersDone", function() {
        ide.init(serverPlugins);
        connect.useAuth(baseUrl, function(req, res, next) {

            if (!req.session.uid) {
                // TODO: We can put this back in once the local version has a login dialog.
//                return next(new error.Unauthorized());
                req.session.uid = "owner_" + req.sessionID;
            }

            var pause = utils.pause(req);
            initUserAndProceed(req.session.uid, function(err) {
                if (err) {
                    next(err);
                    pause.resume();
                    return;
                }
                ide.handle(req, res, next);
                pause.resume();
            });
        });

        log.info("IDE server initialized");
    });
};