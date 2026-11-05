from pathlib import Path
out=Path('public/art');out.mkdir(exist_ok=True)
style='<defs><linearGradient id="g" x2=".7" y2="1"><stop stop-color="#fff" stop-opacity=".28"/><stop offset="1" stop-color="#000" stop-opacity=".10"/></linearGradient><filter id="s"><feGaussianBlur stdDeviation="2"/></filter></defs>'
def svg(name,body,w=160,h=180):
 (out/(name+'.svg')).write_text(f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">{style}{body}</svg>')
def poly(p,c,stroke='#624c3e'):return f'<polygon points="{p}" fill="{c}" stroke="{stroke}" stroke-width="1.5" stroke-linejoin="round"/>'
def box(x,y,w,d,h,c1,c2,c3):
 return poly(f'{x},{y-h} {x+w},{y-h+d*.5} {x+w-d},{y-h+d} {x-d},{y-h+d*.5}',c1)+poly(f'{x-d},{y-h+d*.5} {x+w-d},{y-h+d} {x+w-d},{y+d} {x-d},{y+d*.5}',c2)+poly(f'{x+w-d},{y-h+d} {x+w},{y-h+d*.5} {x+w},{y+d*.5} {x+w-d},{y+d}',c3)
shadow='<ellipse cx="80" cy="156" rx="58" ry="15" fill="#534b3d" opacity=".13" filter="url(#s)"/>'
counter=shadow+box(60,121,104,52,54,'#dec69e','#58988a','#347269')+box(53,63,115,60,7,'#e9cea1','#c5a278','#b08965')
svg('counter',counter)
machine=counter+box(65,68,66,32,42,'#6fa99a','#477c72','#315a57')+'<path d="M50 52v15m18-7v18m24-7v18" stroke="#e2d8b6" stroke-width="5" stroke-linecap="round"/><path d="M54 82q12-14 24 8" fill="none" stroke="#c4c7bd" stroke-width="4"/><ellipse cx="79" cy="98" rx="13" ry="6" fill="#f5f0da"/><path d="M67 96v10q11 12 23 0V99" fill="#f5f0da" stroke="#a8a18b"/><ellipse cx="79" cy="98" rx="9" ry="4" fill="#805536"/><circle cx="66" cy="47" r="4" fill="#f9d293"/><circle cx="83" cy="55" r="4" fill="#eddaba"/>'
svg('machine',machine)
svg('table',shadow+'<path d="M79 90v56m-23 5 23-12 22 12" fill="none" stroke="#876348" stroke-width="7" stroke-linecap="round"/>'+poly('20,86 80,55 141,86 80,119','#bc875a')+poly('20,80 80,49 141,80 80,111','#dfba83')+'<path d="m35 80 45-22 46 22-46 23Z" fill="none" stroke="#edcea0" stroke-width="2"/><ellipse cx="84" cy="78" rx="10" ry="5" fill="#faf5df"/><path d="M76 77v9q8 6 16-1v-8" fill="#faf5df"/><ellipse cx="84" cy="77" rx="7" ry="3" fill="#74533d"/>')
svg('chair',shadow+'<path d="m44 117-6 35m58-10 3 18m29-41 5 27" stroke="#77573f" stroke-width="6" stroke-linecap="round"/>'+box(64,108,62,31,17,'#d49269','#bf7351','#9e573e')+'<path d="M34 110V70q8-25 26-18l49 24q16 8 16 25v17l-24 13-64-23Z" fill="#bd6e50" stroke="#86503e" stroke-width="2"/><path d="M39 106V73q4-19 21-12l39 20q13 7 13 22v18" fill="#d68a66"/><path d="m46 82 53 26" stroke="#e5a17b" stroke-width="2"/>')
plant=shadow+'<path d="m48 118 9 36q23 19 47-4l7-35" fill="#cf8b61" stroke="#976044" stroke-width="2"/><ellipse cx="80" cy="116" rx="32" ry="14" fill="#dfaa7c"/><ellipse cx="80" cy="116" rx="26" ry="10" fill="#71513d"/><path d="M80 117V44m0 47L45 67m35 31 34-27m-33-4 16-39" stroke="#4d6950" stroke-width="5"/>'
for x,y,r,c in [(47,63,-36,'#68936b'),(104,65,39,'#507f61'),(73,44,-14,'#7a9e72'),(94,28,19,'#698c64'),(52,94,-64,'#8aaa78'),(108,96,58,'#75976b')]: plant+=f'<ellipse cx="{x}" cy="{y}" rx="13" ry="26" fill="{c}" transform="rotate({r} {x} {y})"/><path d="M{x} {y-15}v30" stroke="#476e53" opacity=".5" transform="rotate({r} {x} {y})"/>'
svg('plant',plant)
svg('lamp',shadow+'<path d="M80 44v103m-20 5 20-10 20 10" stroke="#586860" stroke-width="6" stroke-linecap="round"/><path d="m52 42 12-25h33l12 25q-28 17-57 0" fill="#edd5a4" stroke="#a78659" stroke-width="2"/><ellipse cx="80" cy="43" rx="28" ry="10" fill="#fff0c7"/>')
svg('moon',shadow+'<path d="M79 93v52m-21 6h44" stroke="#688b88" stroke-width="6"/>'+'<path d="M102 32A39 39 0 1 0 110 97 34 34 0 0 1 102 32" fill="#7dbbb2" stroke="#477e7a" stroke-width="2"/>')
svg('vase',shadow+'<path d="M69 72q-25 27-27 54-3 35 39 36 43-2 36-37-4-31-25-54v-9H69Z" fill="#c78c67" stroke="#855940" stroke-width="2"/><ellipse cx="81" cy="64" rx="12" ry="4" fill="#73523f"/><path d="M60 139q28 8 46-4m-50-12q25 9 51-4" fill="none" stroke="#e7bc8d" stroke-width="4"/>')
svg('statue',shadow+box(55,140,64,32,16,'#cbbd8c','#a99a68','#8c8157')+'<path d="M79 135V68" stroke="#668066" stroke-width="8"/><ellipse cx="64" cy="69" rx="13" ry="26" fill="#8f9e75" transform="rotate(-40 64 69)"/><ellipse cx="94" cy="52" rx="13" ry="26" fill="#7c926c" transform="rotate(30 94 52)"/>')
# Equipment previews are individually drawn; fallbacks always remain local.
for typ,col in [('grinder','#718779'),('fridge','#acc8be'),('display','#bf9d73'),('speaker','#555e56'),('books','#bd785c'),('sign','#447e70')]:
 body=shadow+box(60,115,75,37,75,col,col,'#586b62')
 if typ=='grinder': body+='<path d="M53 47h56l-10 26H64Z" fill="#d9c29d" stroke="#735c49"/><ellipse cx="81" cy="48" rx="28" ry="10" fill="#715441"/>'
 if typ=='display':body=counter+'<path d="m41 67 58 30 28-15V44L69 16 41 31Z" fill="#d7e6db" fill-opacity=".7" stroke="#6f8d80" stroke-width="3"/><path d="m57 57 14-6 10 14-10 5Zm26 13 14-6 10 14-10 5Z" fill="#d6a165"/>'
 if typ=='speaker':body+='<ellipse cx="70" cy="104" rx="15" ry="23" fill="#303e3e"/><ellipse cx="70" cy="68" rx="7" ry="10" fill="#c0a475"/>'
 if typ=='books':body+='<path d="M43 90h14v50H43Zm17 9h13v48H60Zm15 7h13v44H75Z" fill="#e7ca95"/>'
 svg(typ,body)
chars=[('timur','#39877c','#3c302e','#dfae88'),('lola','#c56a4b','#2e292a','#bc8563'),('kamol','#304f60','#51413a','#d5a079'),('sara','#d69a51','#754933','#e3bb93'),('aziz','#7395a2','#272c31','#b98262'),('vera','#947b9d','#c19360','#edc4a1'),('amina','#c56a4b','#49352f','#d9a17c'),('rustam','#52746c','#514740','#c38e68'),('student','#d09d58','#5a3c2e','#e6b98e'),('office','#667f98','#342d2b','#c48f6f'),('tourist','#c57767','#9c633c','#efc6a3'),('laptop','#887e9e','#30363a','#dbad87'),('friends','#7d9d77','#584331','#bd8a65'),('regular','#a57852','#aaa092','#d1a080')]
for n,c,h,sk in chars:
 head=f'<ellipse cx="81" cy="55" rx="26" ry="30" fill="{h}"/><ellipse cx="81" cy="64" rx="23" ry="27" fill="{sk}"/><path d="M56 54q3-36 27-29 26 2 24 37l-11-17q-19 10-40 9" fill="{h}"/><ellipse cx="73" cy="63" rx="2.4" ry="3" fill="#3f3029"/><ellipse cx="90" cy="65" rx="2.4" ry="3" fill="#3f3029"/><path d="M77 78q7 5 12-1" fill="none" stroke="#925948" stroke-width="2" stroke-linecap="round"/><path d="m83 65-2 8h5" fill="none" stroke="#ad7558" stroke-width="1.5"/>'
 if n in ['amina','sara']:head=f'<path d="M51 70q-17-18 0-28-3-21 17-22 17-17 31 0 23 1 20 23 12 21-5 37Z" fill="{h}"/>'+head
 body=f'<path d="M65 128 59 157m35-25 8 25" stroke="#485253" stroke-width="12" stroke-linecap="round"/><path d="M52 160h13m30 0h14" stroke="#594a40" stroke-width="9" stroke-linecap="round"/><path d="M59 94q-14 12-14 34m58-31 13 31" stroke="{sk}" stroke-width="10" stroke-linecap="round"/><path d="m62 85 37 3 8 48q-26 14-53-1Z" fill="{c}" stroke="#645546" stroke-width="1.4"/><path d="M69 91v22h26V93m-27 33h24" fill="none" stroke="#f0d8b8" stroke-width="2"/>'
 svg(n,shadow+body+head)
 svg(n+'-portrait',f'<rect width="160" height="180" rx="28" fill="#eee4d4"/><ellipse cx="85" cy="174" rx="62" ry="58" fill="{c}"/><g transform="translate(-17 -4) scale(1.23)">{head}</g>')
svg('logo','<rect x="4" y="4" width="56" height="56" rx="18" fill="#397e72"/><path d="M19 30h23v9q-2 12-12 12T19 39Z" fill="#f7edda"/><path d="M42 32h5q10 10-6 12" fill="none" stroke="#f7edda" stroke-width="3"/><path d="M29 26q-8-16 2-16 12 2 1 16m1-9 8-5" fill="none" stroke="#f7edda" stroke-width="2.5" stroke-linecap="round"/>',64,64)
for name,color in [('support','#d6ab70'),('neon','#4a827c'),('loft','#bd7553'),('founder','#7f9065'),('plus','#71839c')]:
 svg('product-'+name,f'<rect width="160" height="180" rx="22" fill="{color}" fill-opacity=".13"/>'+({'support':machine,'neon':(out/'moon.svg').read_text().split('</defs>')[1].split('</svg>')[0],'loft':(out/'vase.svg').read_text().split('</defs>')[1].split('</svg>')[0],'founder':(out/'statue.svg').read_text().split('</defs>')[1].split('</svg>')[0],'plus':(out/'books.svg').read_text().split('</defs>')[1].split('</svg>')[0]}[name]))
print('Created',len(list(out.glob('*.svg'))),'original vector assets')
