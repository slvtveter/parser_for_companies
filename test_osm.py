import requests
import json

# Define the Overpass QL query
# We search for cafes in Moscow. Since Moscow is a large area, we query amenity=cafe.
query = """
[out:json][timeout:90];
area["name"="Москва"]->.searchArea;
(
  nwr["amenity"="cafe"](area.searchArea);
);
out tags center;
"""

urls = [
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
]

headers = {
    "User-Agent": "MoscowCafeScraperPortfolio/1.0 (contact: student-portfolio-project@example.com)",
    "Accept": "application/json"
}

response = None
for url in urls:
    print(f"Trying Overpass API mirror: {url}...")
    try:
        # Try POST first
        res = requests.post(url, data={"data": query}, headers=headers, timeout=30)
        if res.status_code == 200:
            response = res
            print(f"Success with {url} using POST!")
            break
        else:
            print(f"POST failed with {res.status_code}. Trying GET...")
            # Try GET
            res = requests.get(url, params={"data": query}, headers=headers, timeout=30)
            if res.status_code == 200:
                response = res
                print(f"Success with {url} using GET!")
                break
            else:
                print(f"GET failed with {res.status_code}.")
    except Exception as e:
        print(f"Error connecting to {url}: {e}")

if response and response.status_code == 200:
    data = response.json()
    elements = data.get("elements", [])
    print(f"Total cafes found: {len(elements)}")
    
    # Count stats
    has_website = 0
    has_phone = 0
    has_contact = 0
    has_brand = 0
    
    sample_cafes = []
    for el in elements:
        tags = el.get("tags", {})
        web = tags.get("website") or tags.get("contact:website")
        ph = tags.get("phone") or tags.get("contact:phone")
        brand = tags.get("brand")
        
        if web:
            has_website += 1
        if ph:
            has_phone += 1
        if web or ph:
            has_contact += 1
        if brand:
            has_brand += 1
            
        if len(sample_cafes) < 5 and (web or ph):
            sample_cafes.append({
                "name": tags.get("name", "Unnamed"),
                "phone": ph,
                "website": web,
                "brand": brand
            })
            
    if len(elements) > 0:
        print(f"Cafes with website: {has_website} ({has_website/len(elements)*100:.1f}%)")
        print(f"Cafes with phone: {has_phone} ({has_phone/len(elements)*100:.1f}%)")
        print(f"Cafes with at least one contact: {has_contact} ({has_contact/len(elements)*100:.1f}%)")
        print(f"Cafes that are part of a brand/chain: {has_brand} ({has_brand/len(elements)*100:.1f}%)")
    else:
        print("No elements found in the response.")
    
    print("\nSample cafes:")
    for idx, s in enumerate(sample_cafes, 1):
        print(f"{idx}. {s['name']} (Brand: {s['brand']})")
        print(f"   Phone: {s['phone']}")
        print(f"   Website: {s['website']}")
else:
    print("Could not retrieve data from any of the Overpass API mirrors.")

