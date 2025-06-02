import re
from dataclasses import dataclass
from typing import List, Dict, Optional
import requests
from bs4 import BeautifulSoup

@dataclass
class JEP:
    """Java Enhancement Proposal"""
    number: str
    title: str
    description: str
    examples: List[Dict[str, str]]
    
    @classmethod
    def from_jep_page(cls, jep_url: str) -> 'JEP':
        """
        Fetch JEP details from its page
        
        Args:
            jep_url: URL of the JEP page
            
        Returns:
            JEP: A JEP object with details from the page
            
        Note:
            This is a placeholder - actual implementation would need to parse the JEP page
        """
        # In a real implementation, we would fetch and parse the JEP page here
        # For now, we'll return a basic JEP with a placeholder description
        return cls(
            number=jep_url.split('/')[-1],
            title="",  # Will be set by the caller
            description="Detailed description would be fetched from the JEP page",
            examples=[]
        )

class JDKScraper:
    BASE_URL = "https://openjdk.org"
    
    @classmethod
    def get_jdk_release_info(cls, version: str) -> dict:
        """
        Fetch JDK release information from OpenJDK website
        
        Args:
            version: JDK version number (e.g., '25')
            
        Returns:
            dict: Dictionary containing release information including JEPs
        """
        url = f"{cls.BASE_URL}/projects/jdk/{version}/"
        
        try:
            response = requests.get(url)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Extract JEPs from the page
            jeps = cls._extract_jeps(soup, version)
            
            # Get release date (this is a simplified example)
            release_date = cls._extract_release_date(soup)
            
            return {
                'version': version,
                'release_date': release_date or f"{version}-03-01",  # Fallback date
                'tagline': "The Future of Java",  # Default tagline
                'jeps': jeps
            }
            
        except requests.RequestException as e:
            print(f"Error fetching JDK {version} information: {e}")
            return None
    
    @staticmethod
    def _extract_jeps(soup: BeautifulSoup, version: str) -> List[JEP]:
        """Extract JEPs from the JDK release page.
        
        Args:
            soup: BeautifulSoup object containing the parsed HTML
            version: JDK version number
            
        Returns:
            List[JEP]: List of JEP objects found on the page
        """
        jeps = []
        seen_jeps = set()  # To avoid duplicates
        
        # First, try to find JEPs in the features/jeps section
        sections_to_try = [
            f'features in jdk {version}',
            f'jdk {version} features',
            'features',
            'jeps',
            f'jdk {version} jeps'
        ]
        
        for section_text in sections_to_try:
            # Try to find a heading with the section text
            heading = soup.find(['h1', 'h2', 'h3', 'h4'], 
                              string=lambda t: t and section_text.lower() in t.lower())
            
            if heading:
                # Find the parent container that holds the JEPs
                container = heading.find_next(['div', 'section', 'article', 'ul', 'ol']) or heading.parent
                
                # Look for JEP links in this container
                for link in container.find_all('a', href=True):
                    href = link.get('href', '').lower()
                    text = link.get_text(strip=True)
                    
                    # Skip empty links or non-JEP links
                    if not href or not text:
                        continue
                        
                    # Look for JEP number in href or text
                    jep_num = None
                    jep_title = None
                    
                    # Check href patterns like /jeps/123 or jep-123
                    href_match = re.search(r'jeps?[/-](\d+)', href)
                    if href_match:
                        jep_num = href_match.group(1)
                        jep_title = text
                    # Check text patterns like "JEP 123: Title"
                    elif re.search(r'^jep\s*\d+', text, re.IGNORECASE):
                        text_match = re.search(r'jep\s*(\d+)[:\s]*(.*)', text, re.IGNORECASE)
                        if text_match:
                            jep_num = text_match.group(1)
                            jep_title = text_match.group(2).strip()
                    
                    # If we found a JEP number we haven't seen before
                    if jep_num and jep_num not in seen_jeps:
                        seen_jeps.add(jep_num)
                        jep_url = f"https://openjdk.org/jeps/{jep_num}"
                        
                        # Clean up the title
                        if not jep_title or jep_title.lower().startswith('jep'):
                            jep_title = f"JEP {jep_num}"
                        
                        # Get description from next element if it's a paragraph
                        description = ""
                        next_elem = link.find_next()
                        if next_elem and next_elem.name == 'p':
                            description = next_elem.get_text(strip=True)
                        
                        jep = JEP(
                            number=jep_num,
                            title=jep_title,
                            description=description,
                            examples=[]
                        )
                        jeps.append(jep)
        
        # If no JEPs found in sections, try a more general approach
        if not jeps:
            for link in soup.find_all('a', href=re.compile(r'jeps?[/-]\d+', re.IGNORECASE)):
                href = link.get('href', '')
                text = link.get_text(strip=True)
                
                if not href or not text:
                    continue
                    
                # Extract JEP number from href
                jep_match = re.search(r'jeps?[/-](\d+)', href, re.IGNORECASE)
                if jep_match:
                    jep_num = jep_match.group(1)
                    if jep_num not in seen_jeps:
                        seen_jeps.add(jep_num)
                        jep_url = f"https://openjdk.org/jeps/{jep_num}"
                        
                        # Clean up the title
                        jep_title = text
                        if jep_title.lower().startswith('jep'):
                            jep_title = re.sub(r'^jep\s*\d+[:\s]*', '', jep_title, flags=re.IGNORECASE).strip()
                        
                        jep = JEP(
                            number=jep_num,
                            title=jep_title or f"JEP {jep_num}",
                            description="",
                            examples=[]
                        )
                        jeps.append(jep)
        
        return jeps
    
    @staticmethod
    def _extract_release_date(soup: BeautifulSoup) -> Optional[str]:
        """Extract the release date from the page.
        
        Args:
            soup: BeautifulSoup object containing the parsed HTML
            
        Returns:
            Optional[str]: Formatted date string in YYYY-MM-DD format, or None if not found
        """
        # First, try to find the General Availability date in the milestones table
        for table in soup.find_all('table', class_='milestones'):
            for row in table.find_all('tr', class_='milestone'):
                cells = row.find_all('td')
                if len(cells) >= 3 and 'General Availability' in cells[2].get_text():
                    date_str = cells[0].get_text().strip()
                    try:
                        # Convert from yyyy/mm/dd to yyyy-mm-dd
                        from datetime import datetime
                        date = datetime.strptime(date_str, '%Y/%m/%d')
                        return date.strftime('%Y-%m-%d')
                    except ValueError:
                        continue
        
        # If not found in the milestones table, try other methods
        text = soup.get_text()
        
        # Look for General Availability date in text
        ga_match = re.search(
            r'General Availability\s*[:]?\s*(\d{4}[/-]\d{1,2}[/-]\d{1,2})', 
            text, 
            re.IGNORECASE
        )
        
        if ga_match:
            date_str = ga_match.group(1).replace('/', '-')
            try:
                # Standardize the date format
                from datetime import datetime
                date = datetime.strptime(date_str, '%Y-%m-%d')
                return date.strftime('%Y-%m-%d')
            except ValueError:
                pass
        
        # Fallback to other date patterns if GA date not found
        date_patterns = [
            r'\b(?:Release )?Date\s*[:=]\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2})\b',
            r'\b(?:GA|General Availability).*?(\d{4}[/-]\d{1,2}[/-]\d{1,2})\b',
            r'\b(?:GA|General Availability)\s+(?:on )?(\w+ \d{1,2}, \d{4})\b',
            r'\b(?:Released on|as of)\s+(\w+ \d{1,2}, \d{4})\b',
        ]
        
        for pattern in date_patterns:
            match = re.search(pattern, text, re.IGNORECASE | re.DOTALL)
            if match:
                try:
                    date_str = match.group(1).replace('/', '-')
                    # Try different date formats
                    from datetime import datetime
                    for fmt in ('%Y-%m-%d', '%B %d, %Y', '%b %d, %Y'):
                        try:
                            date = datetime.strptime(date_str, fmt)
                            return date.strftime('%Y-%m-%d')
                        except ValueError:
                            continue
                except (IndexError, AttributeError):
                    continue
        
        return None
