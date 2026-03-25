import re

with open("apps/web/src/app/(app)/page.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# Fix Button variants and props
content = content.replace('variant="light"', 'variant="ghost"')
content = content.replace('variant="flat"', 'variant="secondary"')
content = content.replace('radius="full"', '')
content = content.replace('color="primary"', 'variant="primary"')
content = content.replace('isIconOnly', '')

with open("apps/web/src/app/(app)/page.tsx", "w", encoding="utf-8") as f:
    f.write(content)
