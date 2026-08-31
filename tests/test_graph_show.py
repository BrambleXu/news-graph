import json
import re
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path

from graph_show import GraphShow


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.scripts = []
        self.external_assets = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'script':
            self.scripts.append(attrs)
        if tag in {'script', 'img', 'iframe'} and 'src' in attrs:
            self.external_assets.append(attrs['src'])
        if tag == 'link' and 'href' in attrs:
            self.external_assets.append(attrs['href'])


class GraphExportTests(unittest.TestCase):
    def export(self, events, source_text=''):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'nested' / 'story.html'
            self.assertEqual(GraphShow().create_page(events, output, source_text=source_text), output)
            html = output.read_text(encoding='utf-8')
        match = re.search(r'<script id="graph-data" type="application/json">(.*?)</script>', html, re.S)
        return json.loads(match[1]), html

    def test_categories_become_attributes_and_reciprocal_links_merge(self):
        data, _ = self.export([
            ['Alice', 'Person'], ['Acme', 'Organization'],
            ['Alice', 'Acme'], ['Acme', 'Alice'], ['Alice', 'Acme'],
            ['Alice', 'keyword'], ['Acme', 'frequency'], [' ', 'Organization'],
        ])
        nodes = {node['data']['label']: node for node in data['nodes']}
        self.assertEqual(set(nodes), {'Alice', 'Acme'})
        self.assertEqual(nodes['Alice']['data']['types'], ['Person', 'keyword'])
        self.assertEqual(nodes['Alice']['data']['degree'], 1)
        self.assertEqual(len(data['edges']), 1)
        self.assertEqual(data['edges'][0]['data'], {'kind': 'cooccurrence'})
        self.assertEqual(data['keywords'], ['Alice'])
        self.assertEqual(data['frequentWords'], ['Acme'])

    def test_unverified_rule_outputs_keep_their_direction(self):
        data, _ = self.export([['Alice', 'Person'], ['Alice', 'did not acquire Acme']])
        labels = {node['id']: node['data']['label'] for node in data['nodes']}
        edge = data['edges'][0]
        self.assertEqual(labels[edge['source']], 'Alice')
        self.assertEqual(labels[edge['target']], 'did not acquire Acme')
        self.assertEqual(edge['data']['kind'], 'extracted')

    def test_html_script_payload_and_placeholder_labels_round_trip(self):
        label = '</ScRiPt><script>document.title="injected"</script> @@APP@@ data_edges "東京"'
        source = label + '\n<svg onload="alert(1)"></svg> & < >'
        data, html = self.export([[label, 'Person']], source)
        self.assertEqual(data['nodes'][0]['data']['label'], label)
        self.assertEqual(data['sourceText'], source)
        parser = PageParser()
        parser.feed(html)
        self.assertEqual(len(parser.scripts), 4)
        self.assertEqual(parser.external_assets, [])
        self.assertNotIn('<svg onload=', html)

    def test_names_with_delimiters_remain_intact(self):
        data, _ = self.export([['AC/DC', 'Organization'], ['@alice', 'Person'], ['AC/DC', '@alice']])
        self.assertEqual({node['data']['label'] for node in data['nodes']}, {'AC/DC', '@alice'})
        self.assertEqual(len(data['edges']), 1)

    def test_blank_and_single_entity_graphs(self):
        for events in ([], [[' ', 'Person']], [['\n', ' ']]):
            with self.subTest(events=events):
                data, _ = self.export(events)
                self.assertEqual(data['nodes'], [])
                self.assertEqual(data['edges'], [])
        data, _ = self.export([['Tokyo', 'Location'], ['Tokyo', 'Tokyo']])
        self.assertEqual(len(data['nodes']), 1)
        self.assertEqual(data['nodes'][0]['data']['degree'], 0)
        self.assertEqual(data['edges'], [])

    def test_ids_do_not_depend_on_event_order(self):
        events = [['Alice', 'Person'], ['Acme', 'Organization'], ['Alice', 'Acme']]
        first, _ = self.export(events)
        second, _ = self.export(reversed(events))
        self.assertEqual(first, second)

    def test_same_label_preserves_multiple_model_types(self):
        data, _ = self.export([['Gwo', 'Person'], ['Gwo', 'Organization']])
        self.assertEqual(len(data['nodes']), 1)
        self.assertEqual(data['nodes'][0]['data']['types'], ['Organization', 'Person'])


if __name__ == '__main__':
    unittest.main()
