with open('src/components/SearchableSelect.tsx', 'r') as f:
    content = f.read()

content = content.replace(
    "interface Props {\n    options: (Option | string)[];\n    value: string;\n    onChange: (val: string) => void;\n    placeholder?: string;\n    required?: boolean;\n}",
    "interface Props {\n    options: (Option | string)[];\n    value: string;\n    onChange: (val: string) => void;\n    placeholder?: string;\n    required?: boolean;\n    inputClassName?: string;\n}"
)

with open('src/components/SearchableSelect.tsx', 'w') as f:
    f.write(content)
