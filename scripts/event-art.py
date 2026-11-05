from pathlib import Path
import re
root=Path('public/art')
ids=re.findall(r"event\('([^']+)'",Path('shared/content.ts').read_text())
objects=['books','machine','plant','table','vase','lamp','display','statue','moon','grinder']
for i,id in enumerate(ids):
 obj=objects[i%len(objects)];src=(root/(obj+'.svg')).read_text();body=src.split('</defs>')[1].split('</svg>')[0]
 wall=['#e5d8be','#c7d4c4','#ddd0bb','#d3d2bd'][i%4];bg=['#f4eddd','#e8eee2','#ede8dc','#e9ebdf'][i%4]
 scene=f'''<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><defs><filter id="s"><feGaussianBlur stdDeviation="2"/></filter></defs><rect width="640" height="360" rx="20" fill="{bg}"/><path d="M60 100 340 20 580 120v160L300 350 60 250Z" fill="{wall}"/><path d="m60 250 280-80 240 110-280 70Z" fill="#cbb38e"/><path d="m385 70 130 50v98l-130-50Z" fill="#f8f2dc"/><path d="m397 88 106 40v71l-106-40Z" fill="#b5cab9"/><path d="m450 108v71m-50-5 100 30" stroke="#f8f2dc" stroke-width="6"/><path d="m390 180-80 100 160 45 34-113Z" fill="#fff4b7" opacity=".25"/><g transform="translate(194 35) scale(1.65)">{body}</g><g transform="translate(450 190) scale(.7)">{(root/'plant.svg').read_text().split('</defs>')[1].split('</svg>')[0]}</g></svg>'''
 (root/('event-'+id+'.svg')).write_text(scene)
print('Created',len(ids),'event illustrations')
