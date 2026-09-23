"""Rebuild the offline OSM snapshot. Python 3.12+, shapely 2.x.
Downloaded raw responses are cached; the browser never calls Overpass.
Data: © OpenStreetMap contributors, ODbL 1.0. See docs/GEODATA.md.
"""
from pathlib import Path
import sys, json, urllib.request, urllib.parse, math, datetime
ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / '.cache/geodata'
sys.path.insert(0, str(CACHE / 'python'))
from shapely.geometry import Polygon, LineString, Point, box
from shapely.ops import polygonize, unary_union

CACHE.mkdir(parents=True, exist_ok=True)
ENDPOINT = 'https://overpass-api.de/api/interpreter'
IDS = {'esil':3479876,'almaty':3482819,'saryarka':3486954,'baikonur':8593081,'sarayshyq':19733918,'nura':20593940}
NAMES={'esil':'Есиль','almaty':'Алматы','saryarka':'Сарыарка','baikonur':'Байконыр','sarayshyq':'Сарайшык','nura':'Нура'}
# Local equirectangular coordinates, east +X, north -Z; 1 scene unit = 1 km.
ORIGIN=(71.43,51.145)
def xy(lon,lat):return ((lon-ORIGIN[0])*111.32*math.cos(math.radians(ORIGIN[1])),(ORIGIN[1]-lat)*111.32)
def coords(g):return [xy(p['lon'],p['lat']) for p in g]
def fetch(name,query):
 p=CACHE/(name+'.json')
 if not p.exists():
  req=urllib.request.Request(ENDPOINT+'?data='+urllib.parse.quote(query),headers={'User-Agent':'Datalicious-Astana-Hackathon/1.0 (offline educational map)'})
  with urllib.request.urlopen(req,timeout=150) as response: data=json.load(response)
  if 'remark' in data:raise RuntimeError(data['remark'])
  p.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
 data=json.loads(p.read_text(encoding='utf-8'));print(name,len(data['elements']),flush=True);return data

def api(name,path):
 p=CACHE/(name+'.json')
 if not p.exists():
  req=urllib.request.Request('https://api.openstreetmap.org/api/0.6/'+path,headers={'User-Agent':'DataliciousHackathon/1.0 offline-map-export'})
  with urllib.request.urlopen(req,timeout=60) as response:data=json.load(response)
  nodes={e['id']:e for e in data['elements'] if e['type']=='node'}
  elements=[]
  for e in data['elements']:
   tags=e.get('tags',{})
   if e['type']=='node':
    if tags.get('highway')=='bus_stop' or any(k in tags for k in ['tourism','historic','name']):elements.append(e)
   elif e['type']=='way':
    e['geometry']=[{'lon':nodes[n]['lon'],'lat':nodes[n]['lat']} for n in e['nodes'] if n in nodes]
    elements.append(e)
   else:elements.append(e)
  data['elements']=elements
  p.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
 data=json.loads(p.read_text(encoding='utf-8'));print(name,len(data['elements']),flush=True);return data

if __name__=='__main__':
 import concurrent.futures
 def boundary(item):
  id,osm=item
  return api('district-'+id,'relation/'+str(osm)+'/full.json')
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool: boundaries=list(pool.map(boundary,IDS.items()))
 def tile(ij):
  i,j=ij; west=71.35+i*.04;south=51.085+j*.03
  return api('map-'+str(i)+'-'+str(j),'map.json?bbox='+','.join(f'{v:.6f}' for v in [west,south,west+.04,south+.03]))
 with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:tiles=list(pool.map(tile,[(i,j) for i in range(4) for j in range(4)]))
 print('Raw snapshot downloaded.',flush=True)
