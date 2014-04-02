"use strict";

var _ = require("underscore");
var JSZip = require("jszip");
var fs = require("fs");
var util = require("substance-util");
var Fragmenter = util.Fragmenter;

var Renderer = function(doc, template) {
  this.doc = doc;
  this.template = template;
};

var renderAnnotatedContent = function(doc, propertyPath) {
  var property = doc.resolve(propertyPath);
  var content = property.get();
  var annotations = doc.getIndex("annotations").get(propertyPath);

  var fragmenter = new Fragmenter({
    // citation_references should not be broken by other annotations
    // so the get a low fragmentation level
    citation_reference: 0
  });
  var annotatedContent = [];

  // called for raw text blocks
  fragmenter.onText = function(context, text) {
    annotatedContent.push(text);
  };

  // called when an annotation starts
  // we write out an opening HTML tag
  fragmenter.onEnter = function(entry) {
    switch (entry.type) {
    case "strong":
      annotatedContent.push("<strong>");
      break;
    case "emphasis":
      annotatedContent.push("<em>");
      break;
    case "code":
      annotatedContent.push("<code>");
      break;
    case "subscript":
      annotatedContent.push("<sub>");
      break;
    case "superscript":
      annotatedContent.push("<sup>");
      break;
    case "citation_reference":
      var ref = doc.get(entry.id);
      var webPage = doc.get(ref.target);
      annotatedContent.push("<a href=\"" + webPage.url + "\" title=\"" + webPage.description + "\">");
      break;
    }
  };

  // called when an annotation is finished
  // we write out a closing tag
  fragmenter.onExit = function(entry) {
    switch (entry.type) {
    case "strong":
      annotatedContent.push("</strong>");
      break;
    case "emphasis":
      annotatedContent.push("</em>");
      break;
    case "code":
      annotatedContent.push("</code>");
      break;
    case "subscript":
      annotatedContent.push("</sub>");
      break;
    case "superscript":
      annotatedContent.push("</sup>");
      break;
    case "citation_reference":
      annotatedContent.push("</a>");
      break;
    }
  };

  fragmenter.start(null, content, annotations);

  return annotatedContent.join("");
};

Renderer.prototype.render = function() {
  var nodes = this.doc.get('content').nodes;
  var doc = this.doc;
  var templateName = this.template;

  var layoutTpl = fs.readFileSync(__dirname+"/templates/"+templateName+"/layout.html", "utf8");

  var compiledLayout = _.template(layoutTpl);

  var fileName = util.slug(doc.title)+".sdf";

  var html = compiledLayout({
    doc: doc,
    filename: fileName,
    render: function() {
      var htmlElements = [];

      // Render nodes
      // -------------

      _.each(nodes, function(nodeId) {
        var node = doc.get(nodeId);
        var nodeTpl = fs.readFileSync(__dirname+"/templates/"+templateName+"/nodes/"+node.type+".html", "utf8");
        var compiledNodeTpl = _.template(nodeTpl);

        htmlElements.push(compiledNodeTpl({
          node: node,
          annotated: function(propertyPath) {
            return renderAnnotatedContent(doc, propertyPath);
          }
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

    var jqueryJS = fs.readFileSync(__dirname+"/templates/"+template+"/jquery-2.1.0.min.js", "utf8");
    result.file("jquery-2.1.0.min.js", jqueryJS);

    var underscoreJS = fs.readFileSync(__dirname+"/templates/"+template+"/underscore.js", "utf8");
    result.file("underscore.js", underscoreJS);

    var appJS = fs.readFileSync(__dirname+"/templates/"+template+"/app.js", "utf8");
    result.file("app.js", appJS);

    result.file("content.json", JSON.stringify(doc.toJSON(), null, "  "));


    // Also write binary files
    var fileIndex = doc.getIndex("files");
    _.each(fileIndex.nodes, function(fileId) {
      var file = doc.get(fileId);
      result.file(fileId, file.getData());
    });

    return result;
  };
};


Compiler.prototype = new Compiler.Prototype();

module.exports = Compiler;
