extends "res://baseline/p1_production_master.gd"

# Capture original semantic labels before Godot auto-renames duplicate nodes.
# super.part is the unmodified CF-3D-05 geometry factory.
func part(label: String, mesh: Mesh, material: Material, p := Vector3.ZERO) -> MeshInstance3D:
	var n := super.part(label,mesh,material,p)
	n.set_meta("surface_label",label)
	return n

func apply_surface_pass() -> void:
	load("res://surface_setup.gd").new().apply_to(self)
