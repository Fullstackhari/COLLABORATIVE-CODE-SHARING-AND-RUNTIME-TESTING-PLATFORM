import pandas as pd
# Create a dictionary
data = {
    'Name': ['John', 'Alice', 'Bob'],
    'Age': [25, 30, 35],
    'City': ['New York', 'London', 'Paris']
}

# Convert the dictionary to a DataFrame
df = pd.DataFrame(data)

# Print the DataFrame
print(df)
