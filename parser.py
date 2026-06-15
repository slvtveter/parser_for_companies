import requests
import json
import re

# Known chains/brands in Russia to filter out or flag as low potential
KNOWN_CHAINS = [
    r"шоколадница", r"кофе хауз", r"правда кофе", r"даблби", r"cofix", r"stars coffee", 
    r"one price coffee", r"хлеб насущный", r"волконский", r"буше", r"синнабон", r"цех 85",
    r"теремок", r"крошка картошка", r"додо пицца", r"додо", r"папа джонс", r"домино'с",
    r"subway", r"burger king", r"доминос", r"kfc", r"ростикс", r"вкусвилл", r"пятерочка",
    r"перекресток", r"магнит", r"дикси", r"ашан", r"метро", r"лента", r"окей",
    r"кофемания", r"surf coffee", r"skuratov", r"кофе тайм", r"coffee like",
    r"baggin's", r"кофейня №1", r"поль бейкери", r"север-метрополь", r"коржов"
]

def query_osm_businesses(city: str, categories: list):
    """
    Builds and executes an Overpass API query for the specified city and categories.
    """
    category_queries = []
    
    # Map friendly names to OSM tags
    osm_mapping = {
        "cafe": 'nwr["amenity"="cafe"](area.searchArea);',
        "bakery": 'nwr["shop"="bakery"](area.searchArea);',
        "confectionery": 'nwr["shop"="confectionery"](area.searchArea);',
        "beauty": 'nwr["shop"="beauty"](area.searchArea);',
        "florist": 'nwr["shop"="florist"](area.searchArea);',
        "restaurant": 'nwr["amenity"="restaurant"](area.searchArea);',
        "fast_food": 'nwr["amenity"="fast_food"](area.searchArea);'
    }
    
    for cat in categories:
        if cat in osm_mapping:
            category_queries.append(osm_mapping[cat])
            
    if not category_queries:
        # Default fallback
        category_queries.append(osm_mapping["cafe"])
        
    categories_str = "\n  ".join(category_queries)
    
    # Build query
    # area["name"="{city}"] is used to restrict the region
    query = f"""
    [out:json][timeout:120];
    area["name"="{city}"]->.searchArea;
    (
      {categories_str}
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
        try:
            # Try POST
            res = requests.post(url, data={"data": query}, headers=headers, timeout=45)
            if res.status_code == 200:
                response = res
                break
        except Exception:
            continue
            
    if not response:
        # Try GET as fallback
        for url in urls:
            try:
                res = requests.get(url, params={"data": query}, headers=headers, timeout=45)
                if res.status_code == 200:
                    response = res
                    break
            except Exception:
                continue
                
    if response and response.status_code == 200:
        return response.json()
    else:
        raise Exception(f"Failed to fetch data from Overpass API (status code: {response.status_code if response else 'No Response'})")

def check_is_chain(name: str, brand: str) -> bool:
    """
    Determines if a business is likely a large chain or franchise.
    """
    if not name:
        return False
        
    name_lower = name.lower()
    brand_lower = brand.lower() if brand else ""
    
    # Check if brand tag exists
    if brand_lower:
        return True
        
    # Check against known chains pattern
    for chain in KNOWN_CHAINS:
        if re.search(chain, name_lower) or (brand_lower and re.search(chain, brand_lower)):
            return True
            
    # Heuristics: if name has digits or indicates branches, might be chain, but we keep it simple
    return False

def calculate_potential_score(is_chain: bool, website: str, phone: str) -> dict:
    """
    Heuristics for how good of a target this business is for a free data analytics gig.
    - HIGH: Independent business, has contact info (phone/web). Needs data help, has contact.
    - MEDIUM: Independent, has only one contact channel.
    - LOW: Is a chain (already has IT department/analysts) OR has absolutely no contact info (impossible to reach).
    """
    if is_chain:
        return {
            "score": "LOW",
            "reason": "Крупная сеть (обычно уже имеют штатных аналитиков и CRM-департамент)",
            "color": "warning"
        }
        
    if not website and not phone:
        return {
            "score": "LOW",
            "reason": "Отсутствуют контакты на карте (сложно связаться)",
            "color": "danger"
        }
        
    if website and phone:
        return {
            "score": "HIGH",
            "reason": "Независимый бизнес с сайтом и телефоном (есть база контактов, высокая вероятность наличия CRM/POS-системы)",
            "color": "success"
        }
        
    return {
        "score": "MEDIUM",
        "reason": "Независимый бизнес, но доступен только один канал связи (телефон или сайт)",
        "color": "primary"
    }

def process_osm_data(osm_data: dict, selected_category: str = None) -> list:
    """
    Processes raw OSM JSON data into structured, cleaned leads.
    """
    elements = osm_data.get("elements", [])
    leads = []
    
    for el in elements:
        tags = el.get("tags", {})
        
        # Determine location coordinates
        lat = el.get("lat")
        lon = el.get("lon")
        if not lat or not lon:
            center = el.get("center", {})
            lat = center.get("lat")
            lon = center.get("lon")
            
        if not lat or not lon:
            continue
            
        # Basic details
        name = tags.get("name", tags.get("name:ru", "Без названия"))
        brand = tags.get("brand", tags.get("brand:ru", ""))
        
        # Contact info
        # Check various common keys
        website = (
            tags.get("website") or 
            tags.get("contact:website") or 
            tags.get("contact:instagram") or 
            tags.get("contact:vk") or 
            tags.get("contact:facebook") or
            ""
        )
        
        phone = (
            tags.get("phone") or 
            tags.get("contact:phone") or 
            tags.get("contact:mobile") or 
            ""
        )
        
        # Clean phone a bit
        if phone:
            phone = phone.replace(";", ", ")
            
        # Address construction
        street = tags.get("addr:street", "")
        housenumber = tags.get("addr:housenumber", "")
        address = ""
        if street:
            address = street
            if housenumber:
                address += f", {housenumber}"
        else:
            address = "Адрес не указан (см. координаты)"
            
        # Category classification
        # OSM tags can contain amenity=cafe, shop=bakery etc.
        osm_amenity = tags.get("amenity", "")
        osm_shop = tags.get("shop", "")
        
        category_label = "Кофейня/Кафе"
        category_key = "cafe"
        
        if osm_shop == "bakery":
            category_label = "Пекарня"
            category_key = "bakery"
        elif osm_shop == "confectionery":
            category_label = "Кондитерская"
            category_key = "confectionery"
        elif osm_shop == "beauty":
            category_label = "Салон красоты"
            category_key = "beauty"
        elif osm_shop == "florist":
            category_label = "Цветочный магазин"
            category_key = "florist"
        elif osm_amenity == "restaurant":
            category_label = "Ресторан"
            category_key = "restaurant"
        elif osm_amenity == "fast_food":
            category_label = "Быстрое питание"
            category_key = "fast_food"
            
        is_chain = check_is_chain(name, brand)
        potential = calculate_potential_score(is_chain, website, phone)
        
        leads.append({
            "id": el.get("id"),
            "name": name,
            "brand": brand if brand else None,
            "is_chain": is_chain,
            "website": website if website else None,
            "phone": phone if phone else None,
            "address": address,
            "lat": lat,
            "lon": lon,
            "category_label": category_label,
            "category_key": category_key,
            "potential_score": potential["score"],
            "potential_reason": potential["reason"],
            "potential_color": potential["color"],
            "opening_hours": tags.get("opening_hours", None)
        })
        
    return leads
