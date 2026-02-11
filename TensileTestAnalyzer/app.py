from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import pandas as pd
import numpy as np
import io

app = Flask(__name__)
CORS(app)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/analyze", methods=["POST"])
def analyze():
    """
    Accepts a CSV file upload along with specimen parameters.
    Calculates stress (σ = F / A) and strain (ε = ΔL / L).
    Returns JSON with raw and calculated data for charting.
    """
    try:
        file = request.files.get("file")
        if not file:
            return jsonify({"error": "No file uploaded."}), 400

        # Specimen parameters from the form
        area = float(request.form.get("area", 0.003))        # m²
        gauge_length = float(request.form.get("length", 1.0))  # m

        if area <= 0 or gauge_length <= 0:
            return jsonify({"error": "Area and Gauge Length must be positive numbers."}), 400

        # Read CSV
        content = file.read().decode("utf-8")
        df = pd.read_csv(io.StringIO(content))

        # Normalise column names: strip whitespace & lowercase
        df.columns = [c.strip().lower() for c in df.columns]

        # --- Detect columns ---
        # We expect columns that contain 'displacement' (or 'extension') and
        # 'load' (or 'force'). Units are assumed to be consistent.
        disp_col = None
        load_col = None
        for col in df.columns:
            if "disp" in col or "extension" in col or "delta" in col:
                disp_col = col
            if "load" in col or "force" in col:
                load_col = col

        if disp_col is None or load_col is None:
            return jsonify({
                "error": (
                    f"Could not auto-detect columns. Found: {list(df.columns)}. "
                    "Please ensure the CSV has columns containing 'displacement' "
                    "(or 'extension') and 'load' (or 'force')."
                )
            }), 400

        displacement = pd.to_numeric(df[disp_col], errors="coerce").dropna().values
        load = pd.to_numeric(df[load_col], errors="coerce").dropna().values

        # Ensure same length after dropping NaN
        min_len = min(len(displacement), len(load))
        displacement = displacement[:min_len]
        load = load[:min_len]

        # --- Calculations ---
        # Stress (MPa) = Force (N) / Area (m²) → Pa, then /1e6 → MPa
        stress = load / area
        stress_mpa = stress / 1e6

        # Strain (mm/mm) = (Displacement (mm) / 1000) / Original Length (m)
        # User specified raw displacement is in mm
        strain = (displacement / 1000) / gauge_length

        # Young's Modulus (MPa) = Stress / Strain at each point
        # Handle division by zero where strain is 0
        with np.errstate(divide='ignore', invalid='ignore'):
            youngs_modulus_arr = np.where(strain != 0, stress_mpa / strain, 0.0)

        # Slope Angle (degrees) = arctan(Young's Modulus)
        # Note: This is purely mathematical based on the values. Visually it depends on axis scaling.
        slope_angles = np.degrees(np.arctan(youngs_modulus_arr))

        # --- Calculate Tangent Modulus (Instantaneous Slope) ---
        try:
            tangent_modulus_arr = np.gradient(stress_mpa, strain)
        except ValueError:
            tangent_modulus_arr = np.zeros_like(stress_mpa)

        # --- Yield Strength (0.2% Offset Method) ---
        # Robust E calculation: Peak Tangent Modulus in the elastic region
        # Identify elastic region: Stress > 5% max (ignore toe), Stran < 50% max (widen search window)
        max_stress_val = np.max(stress_mpa)
        max_strain_val = np.max(strain)
        
        # Widen the window to 50% of strain to catch yield even if it's late
        elastic_mask = (stress_mpa > 0.05 * max_stress_val) & (strain < 0.5 * max_strain_val)
        
        if np.any(elastic_mask):
             # Use the median of the top 10% steepest slopes in this region
             valid_slopes = tangent_modulus_arr[elastic_mask]
             threshold = np.percentile(valid_slopes, 90)
             E = float(np.mean(valid_slopes[valid_slopes >= threshold]))
        else:
             # Fallback
             E = float(np.max(tangent_modulus_arr[:max(5, int(len(strain)*0.2))])) if len(strain) > 5 else 1.0

        # Define Offset Line: y = E * (x - 0.002)
        offset_stress = E * (strain - 0.002)

        # Find Intersection: where Stress Curve CROSSES Offset Line
        yield_index = None
        for i in range(len(strain)):
            if strain[i] > 0.002 and stress_mpa[i] < offset_stress[i]:
                yield_index = i - 1
                break
        
        if yield_index is None:
             yield_point = None
        else:
             yield_point = {
                 "strain": float(strain[yield_index]),
                 "stress": float(stress_mpa[yield_index]),
                 "slope_angle": float(slope_angles[yield_index])
             }

        # Offset Line
        if yield_point:
            offset_line = [
                {"x": 0.002, "y": 0},
                {"x": yield_point["strain"], "y": yield_point["stress"]}
            ]
        else:
            offset_line = []

        # --- Fracture Point ---
        # Search for steepest drop (minimum tangent modulus) AFTER the peak stress
        # This prevents picking up initial settling noise as a "drop"
        peak_idx = np.argmax(stress_mpa)
        
        # Slice from peak to end
        post_peak_tangent = tangent_modulus_arr[peak_idx:]
        
        if len(post_peak_tangent) > 1:
            # Find min slope in post-peak region
            min_slope_idx_local = np.argmin(post_peak_tangent)
            min_slope_val = post_peak_tangent[min_slope_idx_local]
            
            # Global index
            min_slope_idx = peak_idx + min_slope_idx_local
            
            # Significant drop threshold: Slope < -0.05 * E (or just negative enough)
            # If brittle failure (at peak), min_slope_idx might be 0 (local).
            if min_slope_val < -0.05 * E:
                # Fracture is point before drop
                fracture_idx = max(peak_idx, min_slope_idx - 1)
            else:
                fracture_idx = peak_idx # Default to max stress if no sharp drop found
        else:
            fracture_idx = peak_idx

        fracture_point = {
            "strain": float(strain[fracture_idx]),
            "stress": float(stress_mpa[fracture_idx]),
            "slope_angle": float(slope_angles[fracture_idx])
        }

        # Key metrics
        max_stress = float(max_stress_val)
        max_strain = float(max_strain_val)
        max_load = float(np.max(load))
        yield_strength = yield_point["stress"] if yield_point else 0.0

        return jsonify({
            "displacement": displacement.tolist(),
            "load": load.tolist(),
            "stress": stress_mpa.tolist(),
            "strain": strain.tolist(),
            "youngs_modulus": youngs_modulus_arr.tolist(),
            "slope_angles": slope_angles.tolist(),
            "yield_point": yield_point,
            "yield_index": yield_index,
            "fracture_point": fracture_point,
            "offset_line": offset_line,
            "metrics": {
                "max_stress_mpa": round(max_stress, 2),
                "yield_strength_mpa": round(yield_strength, 2),
                "max_strain": round(max_strain, 6),
                "max_load_n": round(max_load, 2),
            },
            "columns_used": {
                "displacement": disp_col,
                "load": load_col,
            }
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True, port=5000)
