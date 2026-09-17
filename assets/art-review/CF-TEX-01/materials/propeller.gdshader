shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never;
uniform mat4 part_to_model;
varying vec3 anchored;
void vertex(){anchored=(part_to_model*vec4(VERTEX,1.0)).xyz;}
void fragment(){
    float r=length(anchored.xy)/0.83;
    float a=atan(anchored.y,anchored.x);
    float edge=smoothstep(0.62,0.94,r)*(1.0-smoothstep(0.95,1.0,r));
    float sweep=0.5+0.5*sin(a*3.0+r*8.0);
    ALBEDO=mix(vec3(0.65,0.73,0.78),vec3(0.94,0.80,0.48),sweep*0.28);
    ALPHA=0.025+edge*(0.08+0.13*sweep);
}
