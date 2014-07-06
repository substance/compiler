"use strict";

var _ = require("underscore");
var fs = require("fs");
var util = require("substance-util");
var Fragmenter = util.Fragmenter;

var Article = require("substance-article");


var Renderer = function(doc, templatePath, templateParams) {
  this.doc = doc;
  this.templatePath = templatePath;
  this.templateParams = templateParams;
};

function htmlEntities(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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
    annotatedContent.push(htmlEntities(text));
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
    case "remark_reference":
      annotatedContent.push("<span class='remark'>");
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
    case "remark_reference":
      annotatedContent.push("</span>");
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

  var result = annotatedContent.join("");
  return result.replace(/\n/g, "<br/>");
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
    params: templateParams,
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
          params: templateParams,
          options: templateParams, // TODO: expose template options
          annotated: function(propertyPath) {
            return renderAnnotatedContent(doc, propertyPath);
          },
          escapedPlainText: function(propertyPath) {
            var property = doc.resolve(propertyPath);
            var content = property.get();
            return htmlEntities(content);
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


  // Compile publication
  // --------
  //
  // templatePath specifies the template being used
  // targetPath is the target directory
  // templateParams contains user settings, e.g. if a table of contents should be used

  this.compile = function(templatePath, targetPath, templateParams, cb) {
    var doc = this.doc;

    var oldFiles = {};

    // Delete old files if there are any
    if (fs.existsSync(targetPath+"/content.json")) {
      var oldDocContent = JSON.parse(fs.readFileSync(targetPath+"/content.json", {encoding: "utf-8"}));
      var oldDoc = Article.fromSnapshot(oldDocContent);
      var fileIndex = oldDoc.getIndex("files");
      
      _.each(fileIndex.nodes, function(fileId) {
        var file = oldDoc.get(fileId);
        oldFiles[fileId] = file;
      });
    }

    // Render the page
    var indexHTML = new Renderer(this.doc, templatePath, templateParams).render();

    // Write index.html
    fs.writeFileSync(targetPath + "/index.html", indexHTML, "utf8");

    var assetsDir = templatePath+"/assets";

    // Copy assets to destination dir
    var assets = fs.readdirSync(assetsDir);
    _.each(assets, function(fileName) {
      var sourceFile = assetsDir + "/"+fileName;
      var targetFile = targetPath + "/"+fileName;
      fs.createReadStream(sourceFile).pipe(fs.createWriteStream(targetFile));
    });


    function writeFile(file) {
      if (file.isBinary()) {
        var buffer = new Buffer(new Uint8Array(file.getData()));
        fs.writeFileSync(targetPath + "/"+file.id, buffer);
      } else if (!file.isJSON()) {
        // For some reason, writing publish.json makes troubles,
        // so we just write non-json files here
        fs.writeFileSync(targetPath + "/"+fileName, file.getData(), "utf8");
      }
    }

    // Also write binary files
    var fileIndex = doc.getIndex("files");
    _.each(fileIndex.nodes, function(fileId) {
      var file = doc.get(fileId);
      var oldFile = oldFiles[fileId];

      // File is already there, should we be smart?
      if (oldFile) {
        if (file.version !== oldFile.version) {
          // overwrite
          writeFile(file);
        } // else just keep the existing file

        delete oldFiles[fileId];
      } else {
        writeFile(file);
      }
    });

    // Remove old files that are no longer referenced to keep the output folder clean
    _.each(oldFiles, function(oldFile, fileId) {
      if (fs.existsSync(targetPath+"/"+oldFile.id)) {
        // console.log('removing..', targetPath+"/"+oldFile.id);
        fs.unlinkSync(targetPath+"/"+oldFile.id);
      }
    });

    // Write content.json
    fs.writeFileSync(targetPath + "/content.json", JSON.stringify(doc, null, "  "), "utf8");

    cb(null);
  };
};


Compiler.prototype = new Compiler.Prototype();

module.exports = Compiler;
