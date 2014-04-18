"use strict";

var _ = require("underscore");
var JSZip = require("jszip");
var fs = require("fs");
var util = require("substance-util");
var Fragmenter = util.Fragmenter;

var Renderer = function(doc, templatePath, templateParams) {
  this.doc = doc;
  this.templatePath = templatePath;
  this.templateParams = templateParams;
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
      var webResource = doc.get(ref.target);
      annotatedContent.push("<a href=\"" + webResource.url + "\" title=\"" + webResource.description + "\">");
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
  var templatePath = this.templatePath;
  var templateParams = this.templateParams;

  // Main entry point is the document node (root node)
  var layoutTpl = fs.readFileSync(templatePath+"/nodes/document.html", "utf8");
  var compiledLayout = _.template(layoutTpl);
  var fileName = util.slug(doc.title)+".sdf";

  var html = compiledLayout({
    doc: doc,
    filename: fileName,
    options: templateParams, // TODO: expose template options
    render: function() {
      var htmlElements = [];

      // Render nodes
      // -------------

      _.each(nodes, function(nodeId) {
        var node = doc.get(nodeId);
        var nodeTpl = fs.readFileSync(templatePath+"/nodes/"+node.type+".html", "utf8");
        var compiledNodeTpl = _.template(nodeTpl);

        htmlElements.push(compiledNodeTpl({
          node: node,
          options: templateParams, // TODO: expose template options
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

  this.compile = function(templatePath, templateParams, cb) {
    var result = new JSZip();
    var doc = this.doc;

    // Render the page
    var indexHTML = new Renderer(this.doc, templatePath, templateParams).render();

    result.file("index.html", indexHTML);
    var assetsDir = templatePath+"/assets";

    // Copy assets to destination dir
    var assets = fs.readdirSync(templatePath+"/assets");

    _.each(assets, function(fileName) {
      var sourcePath = assetsDir + "/"+fileName;
      var fileBuffer = fs.readFileSync(sourcePath);
      result.file(fileName, fileBuffer);
    });

    // Also write binary files
    var fileIndex = doc.getIndex("files");
    _.each(fileIndex.nodes, function(fileId) {
      var file = doc.get(fileId);
      if (file.isBinary()) {
        result.file(fileId, file.getData());  
      }
    });

    if (templateParams.include_source_file) {
      // Attach source file
      util.zip.zip(doc, function(err, zip) {
        var data = zip.generate({type: "nodebuffer"});
        result.file(util.slug(doc.title)+".sdf", data);
        result.file("content.json", JSON.stringify(doc.toJSON(), null, "  "));

        cb(null, result);
      });
    } else {
      cb(null, result);  
    }    
    
  };
};


Compiler.prototype = new Compiler.Prototype();

module.exports = Compiler;
