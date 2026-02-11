# 🚀 Discord Markdown Showcase

Welcome to the ultimate guide for **Discord-flavored Markdown**!
This sample demonstrates how the chunker preserves formatting across message boundaries.

## 📝 Text Styling
You can combine styles in *various* ways:
- **Bold text** for emphasis
- *Italic text* for subtle hints
- ***Bold Italic*** for when you really mean it
- __Underlined text__ to draw the eye
- ~~Strikethrough~~ to show changes
- **Masked Links**: [Visit GitHub](https://github.com)
- **Blockquotes**:
> Blockquotes are perfect for highlighting important quotes or citations.
> They can even span multiple lines to provide more context.

## 🔢 Lists and Nesting
Organize your thoughts with style:

1. **Ordered Lists** help with sequences
  1. They support nesting (2-space indent)
  2. Great for step-by-step guides
2. **Unordered Lists** are great for features
  - Use dashes or asterisks
  - Nested bullets work too!

## 💻 Technical Content
Inline code like `Array.prototype.sort()` is easy to read. For larger snippets, use fenced code blocks with syntax highlighting:

```python
def bubble_sort(arr):
    n = len(arr)
    # Traverse through all array elements
    for i in range(n):
        swapped = False
        # Last i elements are already in place
        for j in range(0, n - i - 1):
            # Traverse the array from 0 to n-i-1
            # Swap if the element found is greater
            # than the next element
            if arr[j] > arr[j + 1]:
                arr[j], arr[j + 1] = arr[j + 1], arr[j]
                swapped = True
        # If no two elements were swapped
        # by inner loop, then break
        if not swapped:
            break
    return arr

# Example usage:
sample_list = [64, 34, 25, 12, 22, 11, 90]
sorted_list = bubble_sort(sample_list)
print(f"Sorted array: {sorted_list}")
```

### Data Structures
Code blocks can also be used for structured data like JSON or configuration files:

```json
{
  "project": "Markdown Showcase",
  "features": [
    "Syntax Highlighting",
    "Preserved Formatting",
    "Intelligent Splitting"
  ],
  "active": true,
  "version": "1.2.0"
}
```

Thank you for using discord-chunker! Report issues at https://github.com/wei/discord-chunker/issues
