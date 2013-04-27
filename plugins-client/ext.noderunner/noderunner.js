/**
 * Node Runner Module for the Cloud9 IDE
 *
 * @copyright 2010, Ajax.org B.V.
 * @license GPLv3 <http://www.gnu.org/licenses/gpl.txt>
 */

define(function(require, exports, module) {

var ide = require("core/ide");
var ext = require("core/ext");
var preview = require("ext/preview/preview");

module.exports = ext.register("ext/noderunner/noderunner", {
    name    : "Node Runner",
    dev     : "Ajax.org",
    type    : ext.GENERAL,
    alone   : true,
    offline : false,
    autodisable : ext.ONLINE | ext.LOCAL,

    init : function() {
        var _self = this;

        ide.addEventListener("consolecommand.run", function(e) {
            ide.send({
                command: "internal-isfile",
                argv: e.data.argv,
                cwd: e.data.cwd,
                sender: "noderunner"
            });
            return false;
        });
    },

    run : function(path, args, debug, nodeVersion, otherRunner) {
        var runner;
        if (typeof path != "string")
            return false;

        var wshargs = {};
        if (typeof args == 'object' && ! Array.isArray(args) && Object.keys(args).length) {
            wshargs.args = JSON.stringify(args);
        }

        if (nodeVersion == "default" || !nodeVersion) {
            runner = this.detectRunner(path);
            nodeVersion = "auto";
        }
        else {
            runner = nodeVersion.split(" ")[0];
            nodeVersion = nodeVersion.split(" ")[1] || "auto";
        }

        if (runner && runner != 'wsh')
            wshargs.runner = runner;

        var query = "";
        if (Object.keys(wshargs).length) {
            for (var i in wshargs) {
                query += "&" + i + "=" + encodeURIComponent(wshargs[i]);
            }
            query = "?" + query.substr(1);
        }

        path = path.trim().replace(/^\/+/, "");

        preview.preview("http://" + ide.webshellPath.substr(1).replace(/\/.*$/, "") + ".webshell.local/" + path + query, debug);
    },

    detectRunner: function(path) {
        if (path.match(/\.coffee$/))
            return "wsh-coffee";

        if (path.match(/\.ts$/))
            return "wsh-typescript";

        return "wsh";
    }
});

});
