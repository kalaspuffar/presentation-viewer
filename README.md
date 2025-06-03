# Web Presentation Generator

# JDK Release Presentation Generator

A tool to automatically generate PowerPoint presentations for JDK releases by scraping JEP (Java Enhancement Proposal) information from the OpenJDK website.

## Features

- Fetches JEPs and release information directly from the OpenJDK website
- Creates a professionally formatted PowerPoint presentation
- Customizable title and tagline
- Handles different JDK versions
- Extracts General Availability dates from the release schedule

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/presentation-generator.git
   cd presentation-generator
   ```

2. Create and activate a virtual environment (recommended):
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install the required dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Usage

### Basic Usage

To generate a presentation for the latest JDK release (defaults to JDK 25):

```bash
python generate_jdk25_presentation.py
```

### Specifying JDK Version

To generate a presentation for a specific JDK version:

```bash
python generate_jdk25_presentation.py 26
```

### Customizing the Presentation

Customize the presentation with a tagline and output file:

```bash
python generate_jdk25_presentation.py 26 --tagline "The Future of Java" --output JDK26_Release_Overview.pptx
```

### Command Line Options

```
positional arguments:
  version         JDK version (default: 25)

options:
  -h, --help      show this help message and exit
  -t TAGLINE, --tagline TAGLINE
                        Tagline for the JDK release (default: "The Future of Java")
  -o OUTPUT, --output OUTPUT
                        Output file path (default: JDK_<version>_Release_Overview.pptx)
```

## Example

```bash
# Generate presentation for JDK 27 with a custom tagline
python generate_jdk25_presentation.py 27 --tagline "Next Generation Java" --output JDK27_Preview.pptx
```

## Requirements

- Python 3.7+
- Microsoft PowerPoint or compatible software (for viewing generated presentations)
- Internet connection (for fetching JEP data)

## Dependencies

- python-pptx: For creating PowerPoint presentations
- requests: For fetching web content
- beautifulsoup4: For parsing HTML
- python-dotenv: For environment variable support (optional)

## Troubleshooting

- If the script fails to fetch JEPs, check your internet connection and the OpenJDK website status
- For authentication issues, ensure you have the necessary permissions to access the OpenJDK website
- If you encounter any bugs, please open an issue on GitHub

## License

This project is licensed under the MIT License - see the LICENSE file for details.
