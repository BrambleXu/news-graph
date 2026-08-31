import json
import re
from pathlib import Path


class GraphShow:
    """Render legacy mining events as a self-contained, offline G6 page."""

    CATEGORIES = {'Person', 'Organization', 'Location', 'keyword', 'frequency'}
    ENTITY_TYPES = {'Person', 'Organization', 'Location'}

    def create_page(self, events, output_path='graph_show.html', *, source_text=''):
        """Write HTML without Node.js or external assets.

        Legacy events contain no counts or per-edge evidence. Node degree is
        computed here; mention counts and confidence scores are not inferred.
        """
        events = [(a.strip(), b.strip()) for a, b in events if a.strip() and b.strip()]
        categories = {}
        labels = set()
        keywords = []
        frequent_words = []
        for source, target in events:
            labels.add(source)
            if target in self.CATEGORIES:
                categories.setdefault(source, set()).add(target)
                if target == 'keyword' and source not in keywords:
                    keywords.append(source)
                if target == 'frequency' and source not in frequent_words:
                    frequent_words.append(source)
            else:
                labels.add(target)

        # Stable IDs also make the initial layout independent of Python hash seeds.
        ids = {label: f'n{index}' for index, label in enumerate(sorted(labels))}
        links = set()
        for source, target in events:
            if target in self.CATEGORIES or source == target:
                continue
            both_entities = all(
                categories.get(label, set()) & self.ENTITY_TYPES
                for label in (source, target)
            )
            if both_entities:
                source, target = sorted((source, target))
            links.add((source, target, 'cooccurrence' if both_entities else 'extracted'))

        neighbors = {label: set() for label in labels}
        edges = []
        for index, (source, target, kind) in enumerate(sorted(links)):
            neighbors[source].add(target)
            neighbors[target].add(source)
            edges.append({
                'id': f'e{index}', 'source': ids[source], 'target': ids[target],
                'data': {'kind': kind},
            })
        nodes = [{
            'id': ids[label],
            'data': {
                'label': label,
                'types': sorted(categories.get(label, set())),
                'degree': len(neighbors[label]),
            },
        } for label in sorted(labels)]
        data = {
            'nodes': nodes, 'edges': edges, 'keywords': keywords,
            'frequentWords': frequent_words, 'sourceText': source_text,
        }
        assets = Path(__file__).resolve().parent / 'web'
        template = (assets / 'graph.html').read_text(encoding='utf-8')
        serialized = json.dumps(data, ensure_ascii=False).replace('<', '\\u003c')

        def script_text(path):
            # HTML recognizes closing script tags inside JS strings and comments.
            text = path.read_text(encoding='utf-8')
            return re.sub(r'</script', lambda m: m[0].replace('</', '<\\/'), text, flags=re.I)

        replacements = {
            'STYLE': (assets / 'graph.css').read_text(encoding='utf-8'),
            'DATA': serialized,
            'G6': script_text(assets / 'vendor' / 'g6.min.js'),
            'APP': script_text(assets / 'graph-layout.js') + '\n' + script_text(assets / 'graph.js'),
            'LICENSE': script_text(assets / 'vendor' / 'LICENSE'),
        }
        # One pass cannot reinterpret placeholders embedded in user data.
        html = re.sub(r'@@(STYLE|DATA|G6|APP|LICENSE)@@', lambda m: replacements[m[1]], template)
        output = Path(output_path)
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(html, encoding='utf-8')
        return output
