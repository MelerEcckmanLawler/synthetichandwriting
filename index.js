const express = require('express')
const app = express()
const server = require('http').createServer(app)
const dirPath = require('path')
const io = require('socket.io')(server)
const port = 3000;
const paper = require('paper-jsdom-canvas');

var glyphs = require('./glyphs.json');
glyphs.chars = [];
let alphabet = 'abcdefghijklmnopqrstuvwxyz';
glyphs.chars.push(...alphabet);

app.use(express.static(dirPath.join(__dirname, '')))
server.listen(port, () => {
  console.log(`Server running on port ${port}.`)
})

var randomRange = (r) => Math.floor(Math.random() * (r + 1)) - (r / 2);
function vAlign(letter) {
  switch (letter) {
    case 'g':
    case 'j':
    case 'p':
    case 'q':
    case 'y':
      return 'hangs';
      break;
    case 'b':
    case 'd':
    case 'f':
    case 'h':
    case 'k':
    case 'l':
    case 't':
      return 'tall';
      break;
    default:
      return 'sits';
      break;
  }
}

function toRange(num, in_min, in_max, out_min, out_max) {
  return (num - in_min) * (out_max - out_min) / (in_max - in_min) + out_min;
}

function randomizePath(path, factor) {
  path.simplify(5)
  let segments = path.segments;
  let firstSegment = path.firstSegment;
  let firstPoint = firstSegment.point;
  let lastSegment = path.lastSegment;
  let lastPoint = lastSegment.point;
  let secondToLastSegment = segments[segments.length - 2];
  let secondToLastPoint = segments[segments.length - 2].point;
  let constant = path.bounds.area / 300;
  firstPoint.x += randomRange(constant * factor);
  firstPoint.y += randomRange(constant * factor);
  for (let j = 1; j < segments.length; j++) {
    let segment = segments[j];
    let curve = segment.curve;
    let point = segment.point;
    let F = (curve.length / (3 + factor)) * (Math.random());
    let tangent = curve.getTangentAt(0);
    point.x += (tangent.x * F);
    point.y += (tangent.y * F);
  }
  let angle = getLineAngle(secondToLastPoint, lastPoint);
  lastPoint.x += randomRange(angle.x + factor);
  lastPoint.y += randomRange(angle.y + factor);

  path.flatten(Math.random() * 10);
  path.simplify(5)
}

function getLineAngle(p1, p2) {
  return { x: p1.x - p2.x, y: p1.y - p2.y };
}

const wrap = (s, char_length) => s.replace(
  new RegExp(`(?![^\\n]{1,${char_length}}$)([^\\n]{1,${char_length}})\\s`, 'g'), '$1\n'
);

io.on('connection', (socket) => {

  socket.on('glyphs', (data) => {
    glyphs = data;
    glyphs.relations = {};
    for (let i = 0; i < glyphs.chars.length; i++) {
      glyphs.relations[glyphs.chars[i]] = [];
      let paths = [];
      with (paper) {
        paper.setup(new Size(1366, 720));
        for (let j = 0; j < glyphs[glyphs.chars[i]].strokes.length; j++) {
          let path = new Path();
          for (let k = 0; k < glyphs[glyphs.chars[i]].strokes[j].length; k++) {
            path.add(glyphs[glyphs.chars[i]].strokes[j][k]);
          }
          paths.push(path);
          glyphs.relations[glyphs.chars[i]][j] = {};
          glyphs.relations[glyphs.chars[i]][j].x = paths[j].position.x - paths[0].position.x;
          glyphs.relations[glyphs.chars[i]][j].y = paths[j].position.y - paths[0].position.y;
          glyphs.relations[glyphs.chars[i]][j].width = paths[j].bounds.width;
          glyphs.relations[glyphs.chars[i]][j].height = paths[j].bounds.height;
        }
      }
    }
  });

  socket.on('input', (data) => {

    with (paper) {
      paper.setup(new Size(1366, 720));

      let text = wrap(data, 30);
      text = text.split('\n');
      for (let i = 0; i < text.length; i++) {
        drawRow(text[i], 50 + (i * 60));
      }

      function drawRow(text, y) {
        let rowWidth = 0;
        for (let i = 0; i < text.length; i++) {
          let strokePile = drawGlyph(text[i], rowWidth, y);
          if (strokePile === null) {
            rowWidth += 50;
          } else {
            let spacing;
            switch (text[i]) {
              case 'k':
                spacing = strokePile.bounds.width;
                break;
              default:
                spacing = strokePile.children[0].bounds.width;
                break;
            }
            rowWidth += spacing + 5;
            strokePile.position.x = rowWidth - (spacing / 2);
            //drawBoundingBox(strokePile);
          }
        }
      }

      function drawGlyph(glyph, x, y) {
        let letter = glyph;
        if (!glyphs.chars.includes(glyph)) {
          return null;
        }
        glyph = glyphs[glyph].strokes;
        let strokes = [];
        for (let i = 0; i < glyph.length; i++) {
          strokes.push(drawStroke(glyph[i], x, y, letter, i));
        }
        let strokePile = new CompoundPath({ children: strokes });
        strokePile.strokeColor = 'black';
        strokePile.strokeWidth = 1;
        if (vAlign(letter) !== 'hangs') {
          sitPath(strokePile);
        }
        
        for (let i = 0; i < strokePile.children.length; i++) {
          if (strokePile.children[i].isDot) {
            continue;
          }
          let diff = glyphs.relations[letter][i].height - strokePile.children[i].bounds.height;
          let widthFactor = glyphs.relations[letter][i].width / strokePile.children[i].bounds.width;
          let heightFactor = glyphs.relations[letter][i].height / strokePile.children[i].bounds.height;

          widthFactor += Math.random() * .1;
          heightFactor += Math.random() * .1;

          strokePile.children[i].bounds.width *= widthFactor;
          strokePile.children[i].bounds.height *= heightFactor;
          strokePile.children[i].position.y -= (diff);
        }
        return strokePile;
      }

      function sitPath(path) {
        path.position.y -= (path.bounds.height / 2);
      }

      function drawBoundingBox(path) {
        let BB = new Path.Rectangle(path.bounds);
        BB.strokeColor = 'red';
      }

      function drawStroke(stroke, x, y, letter, count) {
        let width;
        if (stroke.length == 1) {
          let circle = new Path.Rectangle({ x: x, y: y }, { x: x + 1, y: y + 1 });
          circle.fillColor = 'black';
          circle.strokeColor = 'black';
          circle.position.x += glyphs.relations[letter][count].x;
          circle.position.y += glyphs.relations[letter][count].y;
          circle.isDot = true;
          return circle;
        } else {
          path = new Path();
          path.strokeColor = 'black';
          for (let i = 0; i < stroke.length; i++) {
            path.add(stroke[i]);
          }
          randomizePath(path, 1);
          path.position.x = x + glyphs.relations[letter][count].x;
          path.position.y = y + glyphs.relations[letter][count].y;

          return path;
        }
      }

      let svg = project.exportSVG({ asString: true });
      socket.emit('svg', svg);
    }
  });
});