import argparse
import sys
from datetime import datetime
from presentation_generator import JDKPresentationGenerator, JDKRelease, JEP
from jdk_scraper import JDKScraper

def create_sample_jdk_release(version: str, tagline: str = "The Future of Java") -> JDKRelease:
    """
    Create a JDK release with the specified version and tagline.
    If the version is 25 or higher, tries to fetch real JEPs from OpenJDK.
    Otherwise, falls back to sample data.
    """
    try:
        # Try to fetch real data for JDK 25 or later
        if int(version) >= 25:
            release_info = JDKScraper.get_jdk_release_info(version)
            if release_info:
                release = JDKRelease(
                    version=version,
                    release_date=release_info['release_date'],
                    tagline=tagline
                )
                
                # Add JEPs from the scraped data
                for jep in release_info.get('jeps', []):
                    release.add_jep(jep)
                
                if not release.jeps:
                    print(f"Warning: No JEPs found for JDK {version}. Using sample data.")
                    return _create_sample_jdk_release(version, tagline)
                
                return release
        
        # Fall back to sample data if scraping fails or for versions < 25
        return _create_sample_jdk_release(version, tagline)
        
    except (ValueError, KeyError) as e:
        print(f"Error creating JDK release: {e}")
        print("Falling back to sample data.")
        return _create_sample_jdk_release(version, tagline)

def _create_sample_jdk_release(version: str, tagline: str) -> JDKRelease:
    """Create a sample JDK release with some JEPs (fallback)"""
    release = JDKRelease(
        version=version,
        release_date=f"{version}-10-22" if version.isdigit() else "2024-10-22",
        tagline=tagline
    )
    
    # Add some sample JEPs
    jep1 = JEP(
        number="123",
        title="Pattern Matching for switch (Preview)",
        description="Enhance the Java programming language with pattern matching for switch expressions and statements.",
        examples=[
            {
                "title": "Basic Pattern Matching in Switch",
                'content': '''String response = switch (obj) {
    case Integer i -> String.format(\"int %d\", i);
    case String s -> String.format(\"String %s\", s);
    default -> obj.toString();
};'''
            }
        ]
    )
    
    jep2 = JEP(
        number="456",
        title="Virtual Threads (Second Preview)",
        description="Introduce virtual threads to the Java Platform.",
        examples=[
            {
                "title": "Creating Virtual Threads",
                'content': '// Create a virtual thread\nThread.startVirtualThread(() -> {\n    System.out.println(\"Hello from virtual thread!\");\n});'
            }
        ]
    )
    
    jep3 = JEP(
        number="789",
        title="Structured Concurrency (Incubator)",
        description="Simplify multithreaded programming by treating multiple tasks running in different threads as a single unit of work.",
        examples=[
            {
                'title': 'Structured Concurrency Example',
                'content': '''try (var scope = StructuredTaskScope.ShutdownOnFailure()) {
    Future<String> user = scope.fork(() -> findUser());
    Future<Integer> order = scope.fork(() -> fetchOrder());
    
    scope.join();
    return new Response(user.resultNow(), order.resultNow());
}'''
            }
        ]
    )
    
    # Add JEPs to the release
    release.add_jep(jep1)
    release.add_jep(jep2)
    release.add_jep(jep3)
    
    return release

def parse_arguments():
    """Parse command line arguments"""
    parser = argparse.ArgumentParser(description='Generate a presentation for a JDK release.')
    parser.add_argument('version', nargs='?', default='25',
                       help='JDK version (default: 25)')
    parser.add_argument('--tagline', '-t', default='The Future of Java',
                       help='Tagline for the JDK release')
    parser.add_argument('--output', '-o', default=None,
                       help='Output file path (default: JDK_<version>_Release_Overview.pptx)')
    return parser.parse_args()

def main():
    # Parse command line arguments
    args = parse_arguments()
    
    # Create the JDK release
    jdk_release = create_sample_jdk_release(args.version, args.tagline)
    
    # Set output file path
    output_file = args.output or f"JDK_{jdk_release.version}_Release_Overview.pptx"
    
    # Generate the presentation
    try:
        generator = JDKPresentationGenerator()
        generator.generate_jdk_presentation(jdk_release, output_file)
        print(f"Presentation generated: {output_file}")
    except Exception as e:
        print(f"Error generating presentation: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
