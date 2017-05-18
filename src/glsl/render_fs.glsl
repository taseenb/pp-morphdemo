uniform float alpha;

varying float a;

//varying float size;

void main()
{
//    if (a < 0.5) discard;

    gl_FragColor = vec4(vec3(1.0), a * alpha);
}