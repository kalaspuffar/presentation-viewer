# Web Presentation Generator

This project generates PowerPoint presentations from online data sources. It can extract content, tables, and images from web pages to create professional presentations automatically.

## Features

- Generate PowerPoint presentations from web content
- Extract and format text content
- Include tables from web pages
- Add images from web sources
- Customizable slide layouts

## Installation

1. Clone this repository
2. Install dependencies:
```bash
pip install -r requirements.txt
```

## Usage

```python
from presentation_generator import generate_presentation_from_web_data

generate_presentation_from_web_data("https://example.com")
```

The presentation will be saved as `web_data_presentation.pptx` in the current directory.

## Requirements

- Python 3.7+
- Microsoft PowerPoint (for viewing generated presentations)

## Dependencies

- python-pptx: For creating PowerPoint presentations
- requests: For fetching web content
- beautifulsoup4: For parsing HTML
- pandas: For handling tabular data
