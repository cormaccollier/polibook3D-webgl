let file;
let gl;
let program;
let canvas;
let points, colors, pPoints;
let near = Number.POSITIVE_INFINITY, far = Number.NEGATIVE_INFINITY;
let left = Number.POSITIVE_INFINITY, right = Number.NEGATIVE_INFINITY;
let b = Number.POSITIVE_INFINITY, t = Number.NEGATIVE_INFINITY;
let centerY, centerX, centerZ;
let totScale;
let xtrans = 0;
let xChange = 0;
let ytrans = 0;
let yChange = 0;
let ztrans = 0;
let zChange = 0;
let rollx = false;
let xtheta = 0;
let pulseActive = false;
let pBuffer;
let cBuffer;

function main() {
    canvas = document.getElementById('webgl');

    gl = WebGLUtils.setupWebGL(canvas, undefined);
    if (!gl) {
        console.log('Failed to get the rendering context for WebGL');
        return;
    }

    program = initShaders(gl, "vshader", "fshader");

    gl.useProgram(program);

    gl.viewport( 0, 0, 400, 400);

    //when a file gets uploaded
    document.getElementById("file").onchange = function () {
        file = this.files[0];
        openfile();
    };

    //clear color and enable depth
    gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.enable(gl.DEPTH_TEST);

    //initialize points and pulsed points
    points = [];
    pPoints = [];
    colors = [];

    pBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, pBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(points), gl.STATIC_DRAW);

    let vPosition = gl.getAttribLocation(program,  "vPosition");
    gl.vertexAttribPointer(vPosition, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vPosition);

    var offsetLoc = gl.getUniformLocation(program, "vPointSize");
    gl.uniform1f(offsetLoc, 10.0);

    cBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(colors), gl.STATIC_DRAW);

    let vColor= gl.getAttribLocation(program,  "vColor");
    gl.vertexAttribPointer(vColor, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vColor);

    render();
}

//handles the uploaded file
openfile = () => {
    var reader = new FileReader();
    reader.onload = function () {

        //reset variables in case another file was already loaded
        near = Number.POSITIVE_INFINITY; far = Number.NEGATIVE_INFINITY;
        left = Number.POSITIVE_INFINITY; right = Number.NEGATIVE_INFINITY;
        b = Number.POSITIVE_INFINITY; t = Number.NEGATIVE_INFINITY;
        xtrans = 0; ytrans = 0; ztrans = 0;
        xChange = 0; yChange = 0; zChange = 0;
        rollx = false; xtheta = 0;
        pulseActive = false;

        // By lines
        var lines = this.result.split('\n');

        //check for ply
        if(!lines[0].includes("ply")) { //if file does not start with ply then terminate
            return;
        }

        // get total vertices
        let vLine = lines[2].split(" ");
        let totalV = parseInt(vLine[2]);
        // get num polygons;
        let pLine = lines[6].split(" ");
        let totalP = parseInt(pLine[2]);

        let vCoords = []; // vertex coordinates

        // process points
        let vMax = 9 + totalV;

        //process vertices
        for (let i = 9; i < vMax; i++) {
            let split = lines[i].split(" ");
            let x = parseFloat(split[0]);
            let y = parseFloat(split[1]);
            let z = parseFloat(split[2]);

            vCoords.push(vec4(x, y, z, 1.0));

            //set min and max
            if(x < left) left = x;
            if(x > right) right = x;
            if(y < b) b = y;
            if(y > t) t = y;
            if(z < near) near = z;
            if(z > far) far = z;
        }

        // find the scale and the center
        let scaleX = (right-left);
        let scaleY = (t-b);
        let scaleZ = (far-near);
        totScale = Math.max(scaleX, scaleY, scaleZ);
        centerX = 0.5*(left+right);
        centerY = 0.5*(b+t);
        centerZ = 0.5*(near+far);

        // process Polys
        points = [];
        colors = [];
        let pMax = vMax + totalP;
        let c = vec4(1.0, 1.0, 1.0, 1.0);
        for (let i = vMax; i < pMax; i++) {
            let split = lines[i].split(" ");
            points.push(vCoords[split[1]]);
            points.push(vCoords[split[2]]);
            points.push(vCoords[split[3]]);
            colors.push(c);
            colors.push(c);
            colors.push(c);
        }
    };
    reader.readAsText(file);
};

//render function that gets looped to handle the animations
render = () => {

    //translate matrix to center
    let translateMatrix = mat4(
        1, 0, 0, -centerX,
        0, 1, 0, -centerY,
        0, 0, 1, -centerZ,
        0, 0, 0, 1
    );

    //scale matrix to center
    let scaleMatrix = mat4(
        1/totScale, 0, 0, 0,
        0, 1/totScale, 0, 0,
        0, 0, 1/totScale, 0,
        0, 0, 0, 1
    );

    //rotate matrix
    let ctMatrix = rotateX(xtheta);
    if(rollx)
        xtheta+= 1;

    //translate matrix
    xtrans += xChange;
    ytrans += yChange;
    ztrans += zChange;
    let userTranslateMatrix = translate(xtrans, ytrans, ztrans);

    //pulse the points
    pPoints = [];
    pulse();

    //set lookat
    let eye = vec3(0, 0, 2);
    let at = vec3(0,0,0);
    let up = vec3(0,1,0);
    let modelView = lookAt(eye, at, up);

    //combine matrices
    let modelMoved = mult(modelView, userTranslateMatrix);
    let modelRotated = mult(modelMoved, ctMatrix);
    let modelScaled = mult(modelRotated, scaleMatrix);
    let modelFinal = mult(modelScaled, translateMatrix);

    //perspective projection
    let fovY = 45;
    let aspectRatio = 1;
    let thisProj = perspective(fovY, aspectRatio, 0.01, 100);

    gl.clear( gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    let projMatrix = gl.getUniformLocation(program, 'projMatrix');
    gl.uniformMatrix4fv(projMatrix, false, flatten(thisProj));

    let modelMatrix = gl.getUniformLocation(program, 'modelMatrix');
    gl.uniformMatrix4fv(modelMatrix, false, flatten(modelFinal));

    gl.bindBuffer(gl.ARRAY_BUFFER, pBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(pPoints), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, cBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(colors), gl.STATIC_DRAW);

    //draw arrays, three points at a time to draw as triangles
    for(let i = 0; i < points.length-2; i += 3)
        gl.drawArrays(gl.LINE_LOOP, i, 3);

    //repeat render
    requestAnimationFrame(render);
};

//function to pulse the points and make them translate in new surface normal direction
let transTheta = 0;
pulse = () => {
    //if pulse is active translate points
    if(pulseActive) {
        transTheta = transTheta + (1/10);
    }
    let mv = (Math.cos(transTheta)-1);
    mv = -mv * totScale / 100;
    //translate every point
    for(let i = 0; i < points.length-2; i += 3){
        let normal = newell(points[i], points[i+1], points[i+2]);
        normal = normalize(normal);
        let scaledNormal = vec3(normal[0]*mv ,normal[1]*mv ,normal[2]*mv);
        let tMat = translate(scaledNormal);
        //translate each point and add to pulsed points
        for(let j = i; j < i+3; j++){
            let movedPoint = mult(tMat, vec4(points[j][0],points[j][1],points[j][2],1));
            pPoints.push(movedPoint)
        }
    }
};

//returns normal vector of vectors a1, a2, and a3
newell = (a1, a2, a3) => {
    let mx = 0, my = 0, mz = 0;

    mx+=((a1[1] - a2[1])*(a1[2] + a2[2]));
    mx+=((a2[1] - a3[1])*(a2[2] + a3[2]));
    mx+=((a3[1] - a1[1])*(a3[2] + a1[2]));

    my+=(a1[2] - a2[2])*(a1[0] + a2[0]);
    my+=(a2[2] - a3[2])*(a2[0] + a3[0]);
    my+=((a3[2] - a1[2])*(a3[0] + a1[0]));

    mz+=(a1[0] - a2[0])*(a1[1] + a2[1]);
    mz+=(a2[0] - a3[0])*(a2[1] + a3[1]);
    mz+=((a3[0] - a1[0])*(a3[1] + a1[1]));

    return(vec3(mx, my, mz));
};

//handles key press
window.onkeypress = function(e) {
    let key = e.key.toLocaleLowerCase();
    switch(key) {
        case 'x': //translate in positive x direction
            xChange === 0.05 ? xChange = 0 : xChange = 0.05;
            break;
        case 'c': //translate in negative x direction
            xChange === -0.05 ? xChange = 0 : xChange = -0.05;
            break;
        case 'y': //translate in positive y direction
            yChange === 0.05 ? yChange = 0 : yChange = 0.05;
            break;
        case 'u': //translate in negative y direction
            yChange === -0.05 ? yChange = 0 : yChange = -0.05;
            break;
        case 'z': //translate in positive z direction
            zChange === 0.05 ? zChange = 0 : zChange = 0.05;
            break;
        case 'a': //translate in negative z direction
            zChange === -0.05 ? zChange = 0 : zChange = -0.05;
            break;
        case 'b': //pulsing
            pulseActive ? pulseActive = false : pulseActive = true;
            break;
        case 'r': //rotate around x axis
            rollx ? rollx = false : rollx = true;
            break;
        default:
            break;
    }
};