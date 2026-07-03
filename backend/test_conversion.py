#!/usr/bin/env python3
"""Quick test script to verify markdown to HTML conversion."""

import re

def convert_markdown_to_html(text):
    """Test conversion function mimicking the backend."""
    if not text:
        return ""
    
    # Remove any existing HTML
    text = re.sub(r'<[^>]+>', '', text)
    
    # Split into lines
    lines = text.strip().split('\n')
    formatted_html_lines = []
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        # Convert **term** to HTML span
        line_html = re.sub(
            r'\*\*([^\*]+)\*\*',
            r'<span class="medical-term">\1</span>',
            line
        )
        
        formatted_html_lines.append(line_html)
    
    return '\n'.join(formatted_html_lines)

# Test cases
test_text = """- Core section insight: **Disease Characteristics** for **Pneumonia** suggests infectious lung inflammation patterns.
- Key clinical context: interpret **Pneumonia** with imaging pattern, symptom timeline, and risk profile.
- Diagnostic support: correlate findings with history, examination, and targeted laboratory or specialist evaluation.
- Treatment planning: review suitable **medicine** options, non-pharmacologic care, and expected response monitoring.
- Prevention strategy: reinforce risk-factor control, adherence, and regular **screening** where applicable.
- Follow-up focus: track progression, red-flag worsening, and need for escalation or referral.
- Safety note: discuss all treatment decisions with a qualified clinician before acting on this summary."""

print("Input text:")
print(test_text)
print("\n" + "="*80 + "\n")

result = convert_markdown_to_html(test_text)
print("Converted HTML:")
print(result)
print("\n" + "="*80 + "\n")

print("Verification - checking for <span> tags:")
if '<span class="medical-term">' in result:
    print("✓ HTML spans found!")
    count = result.count('<span class="medical-term">')
    print(f"  Found {count} highlighted terms")
    
    # Show examples
    print("\nExamples of highlighted terms:")
    import re as regex_module
    matches = regex_module.findall(r'<span class="medical-term">([^<]+)</span>', result)
    for match in matches:
        print(f"  - {match}")
else:
    print("✗ No HTML spans found - conversion may have failed!")
