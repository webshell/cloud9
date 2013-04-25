var assert = require("assert");
var utils = require("connect").utils;
var error = require("http-error");
var IdeServer = require("./ide");
var parseUrl = require("url").parse;
var middleware = require("./middleware");
var User = require("./user");

module.exports = function setup(options, imports, register) {

    assert(options.fsUrl, "option 'fsUrl' is required");
    assert.equal(typeof options.hosted, "boolean", "option 'hosted' is required");

    var log = imports.log;
    var hub = imports.hub;
    var pm = imports["process-manager"];
    var connect = imports.connect;
    var permissions = imports["workspace-permissions"];

    var sandbox = imports.sandbox;
    var baseUrl = options.baseUrl || "";
    var staticPrefix = imports.static.getStaticPrefix();
    var workerPrefix = imports.static.getWorkerPrefix() || "/static";

    var ide;
    var serverPlugins = {};

    sandbox.getProjectDir(function(err, projectDir) {
        if (err) return register(err);
        sandbox.getWorkspaceId(function(err, workspaceId) {
            if (err) return register(err);
            pm.runnerTypes(function(err, runnerTypes) {
                if (err) return register(err);
                init(projectDir, workspaceId, runnerTypes);
            });
        });
    });

    function initUserAndProceed(uid, workspaceId, data, callback) {
        if (typeof data == 'function') {
            callback = data;
            data = undefined;
        }
        permissions.getPermissions(uid, workspaceId, "cloud9.core.ide-plugin", function(err, perm) {
            if (err) {
                callback(err);
                return;
            }
            // todo: user check for csid; anyway, fs will refuse access if user try to change its name.
            if (data.username && data.username == data.workspaceDir.split('/')[1])
                perm = User.OWNER_PERMISSIONS;
            ide.addUser(uid, perm, data);
            callback(null, ide.$users[uid]);
        });
    }

    function init(projectDir, workspaceId, runnerTypes) {

        ide = new IdeServer({
            workspaceDir: projectDir,
            settingsPath: "",
            davPrefix: baseUrl + "/workspace",
            projectName: options.projectName || "",
            smithIo: options.smithIo,
            baseUrl: baseUrl,
            debug: (options.debug === true) ? true : false,
            workerUrl: workerPrefix,
            staticUrl: staticPrefix,
            workspaceId: workspaceId,
            runners: runnerTypes,
            name: options.name || workspaceId,
            version: options.version || null,
            requirejsConfig: {
                // http://requirejs.org/docs/api.html#config-waitSeconds
                waitSeconds: 60, // long timeout for slow connections
                baseUrl: staticPrefix,
                paths: imports.static.getRequireJsPaths(),
                packages: imports.static.getRequireJsPackages()
            },
            plugins: options.clientPlugins || [],
            bundledPlugins: options.bundledPlugins || [],
            hosted: options.hosted,
            env: options.env,
            packed: options.packed,
            packedName: options.packedName,
            local: options.local
        });

        var connectModule = connect.getModule();
        var server = connectModule();
        connect.useStart(connectModule.query());
        connect.useSession(connectModule.csrf());
        server.use(function(req, res, next) {
            req.parsedUrl = parseUrl(req.url, true);

            if (!(req.session.uid || req.session.anonid))
                return next(new error.Unauthorized());
            // NOTE: This gets called multiple times!

            req.userData = {
                webshellCsid: req.parsedUrl.query['webshellCsid'] || req.session.userData['webshellCsid'],
                workspaceDir: req.parsedUrl.query['path'] || req.session.userData['workspaceDir'],
                username: req.parsedUrl.query['u'] || req.session.userData['username']
            };
            return next();
        });
        connect.useAuth(baseUrl, server);

        server.use(function(req, res, next) {

            var pause = utils.pause(req);

            initUserAndProceed(req.session.uid || req.session.anonid, ide.options.workspaceId, req.userData, function(err) {
                if (err) {
                    next(err);
                    pause.resume();
                    return;
                }

                // Guard against `Can't set headers after they are sent. Error: Can't set headers after they are sent.`.
                try {
                    next();
                    pause.resume();
                } catch(err) {
                    console.error(err.stack);
                }
            });
        });

        hub.on("ready", function() {
            ide.init(serverPlugins);
            server.use(ide.handle.bind(ide));
            server.use(middleware.errorHandler());
            log.info("IDE server initialized. Listening on " + connect.getHost() + ":" + connect.getPort());
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
                getSocketUrl: function() {
                    console.error(new Error("ide.getSocketUrl() is DEPRECATED").stack);
                },
                getBaseUrl: function() {
                    return baseUrl;
                },
                getWorkspaceId: function() {
                    return ide.options.workspaceId.toString();
                },
                use: function(route, handle) {
                    var last = server.stack.pop();
                    server.use(route, handle);
                    server.stack.push(last);
                },
                canShutdown: ide.canShutdown.bind(ide),
                initUserAndProceed: initUserAndProceed,
                on: ide.on.bind(ide),
                destroy: ide.dispose.bind(ide)
            }
        });
    }
};