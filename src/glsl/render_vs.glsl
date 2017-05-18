
//float texture containing the positions of each particle
uniform sampler2D positionsTexture;
uniform float alpha;

varying float a;
uniform float pointSize;

//varying float size;


void main() {

    //the mesh is a normalized square so the uvs = the xy positions of the vertices
        vec4 pos = texture2D(positionsTexture, position.xy).xyzw;

        a = pos.w;

        //pos now contains the position of a point in space taht can be transformed
        gl_Position = projectionMatrix * modelViewMatrix * pos;

        //size
        gl_PointSize = pointSize;
//        gl_PointSize = max( 1., ( step( 1. - ( 1. / 512. ), position.x ) ) * pointSize );
}