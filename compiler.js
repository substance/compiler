"use strict";

var _ = require("underscore");
var JSZip = require("jszip");
var fs = require("fs");

var Renderer = function(doc, template) {
  this.doc = doc;
  this.template = template;
};

Renderer.prototype.render = function() {
  var nodes = this.doc.get('content').nodes;
  var doc = this.doc;
  var templateName = this.template;

  var layoutTpl = fs.readFileSync(__dirname+"/templates/"+templateName+"/layout.html", "utf8");

  var compiledLayout = _.template(layoutTpl);
  
  var html = compiledLayout({
    doc: doc,
    render: function() {
      var htmlElements = [];
      
      // Render nodes
      // -------------

      _.each(nodes, function(nodeId) {
        var node = doc.get(nodeId);
        var nodeTpl = fs.readFileSync(__dirname+"/templates/"+templateName+"/nodes/"+node.type+".html", "utf8");
        var compiledNodeTpl = _.template(nodeTpl);

        htmlElements.push(compiledNodeTpl({
          node: node
        }));
      });
      return htmlElements.join('\n');
    }
  });

  return html;
};

// Compiler
// --------
//

var Compiler = function(doc) {
  this.doc = doc;
};


Compiler.Prototype = function() {

  this.compile = function(template) {
    var result = new JSZip();
    var doc = this.doc;

    // Render the page
    var indexHTML = new Renderer(this.doc, "default").render();

    result.file("index.html", indexHTML);
    var cssFile = fs.readFileSync(__dirname+"/templates/"+template+"/style.css", "utf8");
    result.file("style.css", cssFile);

    // Also write binary files
    var fileIndex = doc.getIndex("files");
    var files = {};
    _.each(fileIndex.nodes, function(fileId) {
      var file = doc.get(fileId);
      result.file(fileId, file.getData());
    });
    return result;
  };
};


Compiler.prototype = new Compiler.Prototype();

module.exports = Compiler;
