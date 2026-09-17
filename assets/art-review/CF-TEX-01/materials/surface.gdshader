shader_type spatial;
render_mode cull_disabled, diffuse_burley, specular_schlick_ggx;

uniform sampler2D surface_map : source_color, filter_linear_mipmap, repeat_disable;
uniform mat4 part_to_model;
uniform vec4 uv_rect = vec4(0.0,0.0,1.0,1.0);
uniform bool mirror_x = false;
uniform int projection = 0; // 0 root XZ; 1 root XY (propeller); 2 local sphere UV
uniform float metalness = 0.32;
uniform float roughness_base = 0.43;
uniform vec4 tint : source_color = vec4(1.0);
uniform float pigment_variation = 0.003;
varying vec3 anchored;

void vertex() {
    anchored = (part_to_model * vec4(VERTEX,1.0)).xyz;
    // No VERTEX/NORMAL/UV changes. Projection remains in the unposed master space.
}

void fragment() {
    vec2 p = projection == 1 ? anchored.xy : anchored.xz;
    if (mirror_x) {p.x = abs(p.x);}
    vec2 uv = (p-uv_rect.xy)/uv_rect.zw;
    if (projection == 2) {uv=UV;}
    vec3 painted = texture(surface_map, uv).rgb;
    float grain = sin(anchored.x*157.0+sin(anchored.z*53.0))*sin(anchored.z*113.0);
    ALBEDO = painted*tint.rgb*(1.0+grain*pigment_variation);
    METALLIC = metalness;
    ROUGHNESS = clamp(roughness_base+0.045*(painted.r-painted.b)+grain*0.008,0.22,0.95);
    SPECULAR = 0.42;
}
