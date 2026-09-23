"""Convert the cached OSM extract to an offline, bounded scene dataset.
No district boundaries, road alignments or landmark coordinates are invented.
"""
from pathlib import Path
import sys,json,math,datetime
ROOT=Path(__file__).resolve().parents[1];CACHE=ROOT/'.cache/geodata'
sys.path.insert(0,str(CACHE/'python'))
from shapely.geometry import Polygon,LineString,Point,box
from shapely.ops import polygonize,unary_union,linemerge
from shapely.prepared import prep
from shapely.strtree import STRtree
IDS={'esil':3479876,'almaty':3482819,'saryarka':3486954,'baikonur':8593081,'sarayshyq':19733918,'nura':20593940}
NAMES={'esil':'Есиль','almaty':'Алматы','saryarka':'Сарыарка','baikonur':'Байконыр','sarayshyq':'Сарайшык','nura':'Нура'}
ORIGIN=(71.43,51.145)
def xy(lon,lat):return ((lon-ORIGIN[0])*111.32*math.cos(math.radians(ORIGIN[1])),(ORIGIN[1]-lat)*111.32)
def coord(g):return [xy(p['lon'],p['lat']) for p in g]
def read(p):return json.loads(p.read_text(encoding='utf-8'))
def polygons(g):return [g] if g.geom_type=='Polygon' else [p for p in getattr(g,'geoms',[]) if p.geom_type=='Polygon']
def lines(g):return [g] if g.geom_type=='LineString' else [p for p in getattr(g,'geoms',[]) if p.geom_type=='LineString']
def pts(c):return [[round(x,5),round(y,5)]for x,y in c]
def rings(g):return [[pts(p.exterior.coords),*[pts(r.coords) for r in p.interiors]]for p in polygons(g)]
def relation_polygon(relation,ways):
 def assemble(role):
  segments=[LineString(coord(ways[m['ref']]['geometry'])) for m in relation['members'] if m['type']=='way' and m.get('role', 'outer')==role and m['ref'] in ways and len(ways[m['ref']].get('geometry',[]))>1]
  return unary_union(list(polygonize(unary_union(segments))))
 outer=assemble('outer');inner=assemble('inner')
 return outer.difference(inner).buffer(0)

def build():
 core=box(*(*xy(71.35,51.205),*xy(71.51,51.085)))
 districts={};metadata=[]
 for id,osm in IDS.items():
  data=read(CACHE/('district-'+id+'.json'));ways={e['id']:e for e in data['elements']if e['type']=='way'}
  rel=next(e for e in data['elements']if e['type']=='relation' and e['id']==osm)
  polygon=relation_polygon(rel,ways)
  if polygon.is_empty:raise ValueError('Unclosed district '+id)
  districts[id]=polygon
  metadata.append({'id':id,'name':NAMES[id],'osmId':osm,'version':rel['version'],'editedAt':rel['timestamp'],'areaKm2':round(polygon.area,2),'polygons':rings(polygon.simplify(.012,preserve_topology=True)),'core':rings(polygon.intersection(core).simplify(.006,preserve_topology=True)),'center':pts([polygon.intersection(core).representative_point().coords[0]])[0],'fullCenter':pts([polygon.representative_point().coords[0]])[0]})
 elements={}
 for p in sorted(CACHE.glob('map-*.json')):
  for e in read(p)['elements']:elements[(e['type'],e['id'])]=e
 ways={e['id']:e for e in elements.values()if e['type']=='way'}
 buildings=[];parks=[];water=[];roads=[];footways=[];stops=[]
 for e in elements.values():
  t=e.get('tags',{});g=e.get('geometry',[])
  if e['type']=='node' and t.get('highway')=='bus_stop':stops.append((e,Point(xy(e['lon'],e['lat']))))
  if e['type']!='way' or len(g)<2:continue
  path=coord(g);line=LineString(path)
  if not line.intersects(core):continue
  closed=path[0]==path[-1] and len(path)>3
  poly=Polygon(path).buffer(0) if closed else None
  if t.get('building') and poly is not None and not poly.is_empty:buildings.append((e,poly))
  if t.get('leisure') in ['park','garden','pitch','playground'] and poly is not None:parks.append((e,poly))
  if t.get('natural')=='water' and poly is not None:water.extend(polygons(poly))
  if t.get('highway') in ['primary','secondary','tertiary','trunk','motorway','primary_link','secondary_link','tertiary_link','residential','unclassified','service']:
   roads.append((e,line))
  if t.get('highway') in ['footway','path','pedestrian']:footways.append((e,line))
 for e in elements.values():
  if e['type']=='relation' and e.get('tags',{}).get('natural')=='water':
   water.extend(polygons(relation_polygon(e,ways)))
 print('Features',len(buildings),len(parks),len(roads),len(footways),flush=True)
 waterUnion=unary_union(water).intersection(core);waterPrepared=prep(waterUnion)
 buildingUnion=unary_union([p for _,p in buildings]);buildingPrepared=prep(buildingUnion)
 # Geographic feature vertices are retained at ~1 m precision. Heights are
 # illustrative: tagged heights where present, otherwise three storeys.
 def height(e):
  t=e.get('tags',{})
  try:return min(200,float(t.get('height',str(float(t.get('building:levels',3))*3)).split()[0]))
  except ValueError:return 9
 # At most one footprint per 60 m cell, preferring larger mapped buildings.
 occupied=set();selected=[]
 for e,p in sorted(buildings,key=lambda ep:ep[1].area,reverse=True):
  c=p.centroid;cell=(int(c.x/.06),int(c.y/.06))
  if cell in occupied or p.area<.00015 or not core.contains(c):continue
  occupied.add(cell);selected.append({'osmId':e['id'],'rings':rings(p.simplify(.001))[0],'height':height(e),'heightKnown':('height' in e.get('tags',{}) or 'building:levels' in e.get('tags',{}))})
  if len(selected)>=4500:break
 roadOutput=[]
 for e,line in roads:
  t=e.get('tags',{});kind=t.get('highway')
  if kind=='service':continue
  for part in lines(line.intersection(core)):
   roadOutput.append({'osmId':e['id'],'kind':kind,'bridge':t.get('bridge')=='yes','name':t.get('name:ru',t.get('name','')),'points':pts(part.simplify(.002).coords)})
 river=[]
 for e in ways.values():
  if e.get('tags',{}).get('waterway') in ['river','canal'] and len(e.get('geometry',[]))>1:
   for line in lines(LineString(coord(e['geometry'])).intersection(core)):
    river.append({'osmId':e['id'],'name':e.get('tags',{}).get('name',''),'points':pts(line.coords)})
 routes={};sites={}
 parkTree=STRtree([p for _,p in parks])
 for id,district in districts.items():
  if id=='sarayshyq':continue
  interior=prep(district.intersection(core).buffer(-.015));graph={};positions={}
  # Nodes form a connected OSM road graph. Exclude roads crossing water without
  # a bridge tag and any segment too close to an existing building footprint.
  for e,line in roads:
   if e.get('tags',{}).get('highway') in ['service','residential']:continue
   points=coord(e['geometry']);nodes=e.get('nodes',[])
   for index,(a,b) in enumerate(zip(points,points[1:])):
    segment=LineString([a,b]);length=segment.length
    if length<.005 or not interior.contains(segment):continue
    if buildingPrepared.intersects(segment.buffer(.03)):continue
    if waterPrepared.intersects(segment) and e.get('tags',{}).get('bridge')!='yes':continue
    na,nb=nodes[index:index+2];positions[na]=a;positions[nb]=b
    graph.setdefault(na,[]).append((nb,length,e['id']));
    if e.get('tags',{}).get('oneway')!='yes':graph.setdefault(nb,[]).append((na,length,e['id']))
  # Choose a connected, directed walk with turns; never interpolate between
  # unrelated roads. Playback reverses only at a marked demo terminal.
  best=[];bestLength=0;bestScore=0;bestIds=[]
  localStops=[p for _,p in stops if district.contains(p)]
  for start in list(graph)[::max(1,len(graph)//160)]:
   path=[start];ids=[];used=set();distance=0;current=start
   for _ in range(100):
    candidates=[p for p in graph.get(current,[])if p[0] not in used]
    if not candidates:break
    nxt,length,way=max(candidates,key=lambda c:c[1]+(.08 if len(graph.get(c[0],[]))>1 else 0))
    used.add(current);path.append(nxt);ids.append(way);distance+=length;current=nxt
    if distance>2.6:break
   if len(path)>1:
    candidate=LineString([positions[n]for n in path])
    score=distance+sum(candidate.distance(p)<.065 for p in localStops)*.6
    if score>bestScore:bestScore=score;bestLength=distance;best=path;bestIds=ids
  if not best:raise ValueError('No safe connected road route for '+id)
  route=LineString([positions[n]for n in best]);stopList=[]
  for e,p in stops:
   if route.distance(p)<.065:stopList.append({'osmId':e['id'],'at':round(route.project(p)/route.length,5),'point':pts([p.coords[0]])[0]})
  stopList=sorted(stopList,key=lambda s:s['at'])
  if len(stopList)>4:stopList=stopList[::max(1,len(stopList)//4)][:4]
  routes[id]={'points':pts(route.coords),'wayIds':list(dict.fromkeys(bestIds)),'stops':stopList,'lengthKm':round(route.length,3),'isPublicBusRoute':False}
  candidates=[]
  for path,line in footways:
   if not interior.contains(line):continue
   for parkIndex in parkTree.query(line,predicate='intersects'):
    park,poly=parks[int(parkIndex)]
    for part in lines(line.intersection(poly.buffer(-.01))):
     if part.length<.05:continue
     center=part.interpolate(.5,normalized=True)
     if buildingPrepared.intersects(center.buffer(.025)) or waterPrepared.intersects(center.buffer(.025)):continue
     if not interior.contains(center.buffer(.025)):continue
     candidates.append((part.length,park,path,part,poly))
  if not candidates:raise ValueError('No mapped public pedestrian site for '+id)
  _,park,path,line,usable=max(candidates,key=lambda a:a[0])
  # A short stretch of an existing footpath is the demonstration venue.
  center=line.interpolate(.5,normalized=True)
  small=line.intersection(center.buffer(.14))
  pathpart=max(lines(small),key=lambda l:l.length)
  sites[id]={'point':pts([center.coords[0]])[0],'path':pts(pathpart.coords),'parkId':park['id'],'pathId':path['id'],'name':park.get('tags',{}).get('name:ru',park.get('tags',{}).get('name','Общественная площадка'))}
  print(id,'route',round(route.length,2),'stops',len(stopList),'site',sites[id]['name'],flush=True)
 # Landmark locations come from mapped building footprints, not hand positions.
 landmarks=[]
 targets=[('baiterek',230401645,'Байтерек'),('akorda',166198046,'Ак Орда'),('khan',460703779,'Хан Шатыр'),('expo',454857501,'EXPO')]
 # EXPO sphere is identified by its building footprint/name in the extract.
 for e in ways.values():
  if any(x in e.get('tags',{}).get('name','').lower() for x in ['нұр әлем','нур алем','nur alem','nur alem']):print('EXPO candidate',e['id'],e.get('tags'),flush=True)
 for id,osm,name in targets:
  e=ways[osm];p=Polygon(coord(e['geometry'])).centroid
  landmarks.append({'id':id,'osmId':osm,'name':name,'point':pts([p.coords[0]])[0]})
 result={'source':'© OpenStreetMap contributors','license':'ODbL-1.0','retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'origin':list(ORIGIN),'units':'kilometres','coreBounds':list(core.bounds),'districts':metadata,'roads':roadOutput,'buildings':selected,'parks':[{'osmId':e['id'],'rings':rings(p.intersection(core).simplify(.003))}for e,p in parks if not p.intersection(core).is_empty],'water':rings(waterUnion.simplify(.003)),'rivers':river,'routes':routes,'sites':sites,'landmarks':landmarks}
 # Keep the shipped model light: its houses are illustrative, not OSM footprints.
 # Raw features remain available above for safe route/site selection.
 for key in ['roads','buildings','parks','water','rivers']:result[key]=[]
 output=ROOT/'src/components/city/geodata/astana.json';output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
 print('Export',len(metadata),'districts and demo paths',round(output.stat().st_size/1024),'KiB',flush=True)
if __name__=='__main__':build()
