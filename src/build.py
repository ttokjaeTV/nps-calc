"""template.html + engine.js -> ../index.html (단일 HTML로 합치기)
사용법: python src/build.py   (저장소 루트에서)
"""
from pathlib import Path
src = Path(__file__).parent
t = (src / 'template.html').read_text(encoding='utf-8')
e = (src / 'engine.js').read_text(encoding='utf-8')
assert '/*__ENGINE__*/' in t, 'template.html에 /*__ENGINE__*/ 자리표시가 없습니다'
(src.parent / 'index.html').write_text(t.replace('/*__ENGINE__*/', e), encoding='utf-8')
print('index.html 생성 완료')
