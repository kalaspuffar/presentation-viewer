from presentation_generator import JDKPresentationGenerator, JDKRelease, JEP
from datetime import datetime

def create_sample_jdk25_release():
    """Create a sample JDK 25 release with some JEPs"""
    # Create JDK 25 release
    release = JDKRelease(
        version="25",
        release_date="2024-10-22",  # Expected release date for JDK 25
        tagline="The Future of Java"
    )
    
    # Add some sample JEPs (these would come from the OpenJDK website)
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
        description="Introduce virtual threads to the Java Platform."
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

def main():
    # Create a sample JDK 25 release
    jdk25 = create_sample_jdk25_release()
    
    # Generate the presentation
    generator = JDKPresentationGenerator()
    output_file = f"JDK_{jdk25.version}_Release_Overview.pptx"
    generator.generate_jdk_presentation(jdk25, output_file)
    print(f"Presentation generated: {output_file}")

if __name__ == "__main__":
    main()
