# Tensile Test Analyzer™

> A web-based tool to visualize and analyze tensile test data. Upload your CSV file and instantly see **Displacement vs Load** and **Stress vs Strain** curves.

---

## Features

- **CSV Upload** — Drag & drop or browse for your tensile test data file
- **Auto-detects columns** — Looks for columns containing `displacement`/`extension` and `load`/`force`
- **Stress Calculation** — σ (MPa) = Force (N) / Cracked Area (m²)
- **Strain Calculation** — ε (mm/mm) = Displacement / Original Length
- **Interactive Charts** — Powered by Chart.js with hover tooltips
- **Summary Metrics** — Max Stress, Max Strain, Max Load at a glance

---

## Quick Start (Any Device)

### Prerequisites

- **Python 3.8+** — [Download here](https://www.python.org/downloads/)
- **pip** (comes with Python)

### Installation

1. **Download or clone** this project folder to your computer.

2. **Open a terminal** (Command Prompt / PowerShell on Windows, Terminal on Mac/Linux) and navigate to the project folder:

   ```bash
   cd path/to/stress_strain_app
   ```

3. **Install dependencies**:

   ```bash
   pip install -r requirements.txt
   ```

4. **Start the app**:

   ```bash
   python app.py
   ```

5. **Open your browser** and go to:

   ```
   http://127.0.0.1:5000
   ```

---

## CSV Format

Your CSV file should have at least two columns. The app auto-detects them by name:

| Accepted column names (case-insensitive) | Meaning         |
| ---------------------------------------- | --------------- |
| `displacement`, `extension`, `delta`     | Extension (ΔL) |
| `load`, `force`                          | Force in Newtons |

**Example CSV:**

```csv
displacement,load
0.000,0
0.001,500
0.002,1200
0.003,2000
```

---

## Project Structure

```
stress_strain_app/
├── app.py                  # Flask backend (server + calculations)
├── requirements.txt        # Python dependencies
├── sample_data.csv         # Example data for testing
├── README.md               # This file
├── templates/
│   └── index.html          # Main web page
└── static/
    ├── css/
    │   └── styles.css      # Styling
    └── js/
        └── script.js       # Frontend logic & charts
```

---

## Formulas

| Symbol | Formula                          | Unit    |
| ------ | -------------------------------- | ------- |
| σ      | Force (N) / Cracked Area (m²)   | MPa     |
| ε      | Displacement / Original Length   | mm/mm   |

---

## Troubleshooting

| Problem                            | Solution                                          |
| ---------------------------------- | ------------------------------------------------- |
| `python` not recognized            | Ensure Python is added to PATH during installation |
| `ModuleNotFoundError: flask`       | Run `pip install -r requirements.txt`             |
| Page won't load                    | Check terminal — is the server running on port 5000? |
| Columns not detected               | Rename CSV headers to `displacement` and `load`   |

---

© 2026 Tensile Test Analyzer™ — Built for Materials Science Labs
