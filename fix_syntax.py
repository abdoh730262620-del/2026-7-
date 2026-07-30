import re

with open('src/pages/CardsManagement.tsx', 'r') as f:
    content = f.read()

# I will find all instances of safeWrite and add the missing closing parenthesis
# wait, it's easier to just remove safeWrite( from where I added it, and re-apply it properly.
content = content.replace("await safeWrite(addDoc", "await addDoc")
content = content.replace("await safeWrite(updateDoc", "await updateDoc")
content = content.replace("await safeWrite(deleteDoc", "await deleteDoc")

with open('src/pages/CardsManagement.tsx', 'w') as f:
    f.write(content)

