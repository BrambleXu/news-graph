import re
from collections import Counter
import spacy
from graph_show import GraphShow
from textrank import TextRank


nlp = spacy.load('en_core_web_lg')

class NewsMining():
    """News Mining"""
    def __init__(self):
        self.textranker = TextRank()
        self.ners = ['PERSON', 'ORG', 'GPE']
        self.ner_dict = {
            'PERSON': 'Person',  # People, including fictional
            'ORG': 'Organization',  # Companies, agencies, institutions, etc.
            'GPE': 'Location',  # Countries, cities, states.
        }
        # dependency markers for subjects
        self.SUBJECTS = {"nsubj", "nsubjpass",
                         "csubj", "csubjpass", "agent", "expl"}
        # dependency markers for objects
        self.OBJECTS = {"dobj", "dative", "attr", "oprd"}

        self.graph_shower = GraphShow()

    def clean_spaces(self, s):
        s = s.replace('\r', '')
        s = s.replace('\t', ' ')
        s = s.replace('\n', ' ')
        return s

    def remove_noisy(self, content):
        """Remove brackets"""
        p1 = re.compile(r'（[^）]*）')
        p2 = re.compile(r'\([^\)]*\)')
        return p2.sub('', p1.sub('', content))

    def collect_ners(self, ents):
        """Collect token only with PERSON, ORG, GPE"""
        collected_ners = []
        for token in ents:
            if token.label_ in self.ners:
                collected_ners.append(token.text + '/' + token.label_)
        return collected_ners

    def conll_syntax(self, sent):
        """Convert one sentence to conll format."""

        tuples = list()
        for word in sent:
            if word.head is word:
                head_idx = 0
            else:
                head_idx = word.head.i + 1
            tuples.append([word.i + 1,  # Current word index, begin with 1
                           word.text,  # Word
                           word.lemma_,  # Lemma
                           word.pos_,  # Coarse-grained tag
                           word.tag_,  # Fine-grained tag
                           '_',
                           head_idx,  # Head of current  Index
                           word.dep_,  # Relation
                           '_', '_'])
        return tuples

    def syntax_parse(self, sent):
        """Convert one sentence to conll format."""
        tuples = list()
        for word in sent:
            if word.head is word:
                head_idx = 0
            else:
                head_idx = word.head.i + 1
            tuples.append([word.i + 1,  # Current word index, begin with 1
                           word.text,  # Word
                           word.pos_,  # Coarse-grained tag
                           word.head,
                           head_idx,  # Head of current  Index
                           word.dep_,  # Relation
                           ])
        return tuples

    def build_parse_chile_dict(self, sent, tuples):
        child_dict_list = list()
        for word in sent:
            child_dict = dict()
            for arc in tuples:
                if arc[3] == word:
                    if arc[-1] in child_dict:
                        child_dict[arc[-1]].append(arc)
                    else:
                        child_dict[arc[-1]] = []
                        child_dict[arc[-1]].append(arc)
            child_dict_list.append([word, word.pos_, word.i, child_dict])
        return child_dict_list

    def complete_VOB(self, verb, child_dict_list):
        '''Find VOB by SBV'''
        for child in child_dict_list:
            word = child[0]
            # child_dict: {'dobj': [[7, 'startup', 'NOUN', buying, 5, 'dobj']], 'prep': [[8, 'for', 'ADP', buying, 5, 'prep']]}
            child_dict = child[3]
            if word == verb:
                for object_type in self.OBJECTS:  # object_type: 'dobj'
                    if object_type not in child_dict:
                        continue
                    # [7, 'startup', 'NOUN', buying, 5, 'dobj']
                    vob = child_dict[object_type][0]
                    obj = vob[1]  # 'startup'
                    return obj
        return ''

    def extract_triples(self, sent):
        svo = []
        tuples = self.syntax_parse(sent)
        child_dict_list = self.build_parse_chile_dict(sent, tuples)
        for tuple in tuples:
            rel = tuple[-1]
            if rel in self.SUBJECTS:
                sub_wd = tuple[1]
                verb_wd = tuple[3]
                obj = self.complete_VOB(verb_wd, child_dict_list)
                subj = sub_wd
                verb = verb_wd.text
                if not obj:
                    svo.append([subj, verb])
                else:
                    svo.append([subj, verb+' '+obj])
        return svo

    def extract_keywords(self, words_postags):
        return self.textranker.extract_keywords(words_postags, 10)

    def collect_coexist(self, ner_sents, ners):
        """Construct NER co-occurrence matrices"""
        co_list = []
        for words in ner_sents:
            co_ners = set(ners).intersection(set(words))
            co_info = self.combination(list(co_ners))
            co_list += co_info
        if not co_list:
            return []
        return {i[0]: i[1] for i in Counter(co_list).most_common()}

    def combination(self, a):
        '''list all combination'''
        combines = []
        if len(a) == 0:
            return []
        for i in a:
            for j in a:
                if i == j:
                    continue
                combines.append('@'.join([i, j]))
        return combines

    def main(self, content):
        '''Main function'''
        if not content:
            return []

        words_postags = []  # token and its POS tag
        ner_sents = []      # store sentences which contain NER entity
        ners = []           # store all NER entity from whole article
        triples = []        # store subject verb object
        events = []         # store events

        # 01 remove linebreaks and brackets
        content = self.remove_noisy(content)
        content = self.clean_spaces(content)

        # 02 split to sentences
        doc = nlp(content)

        for i, sent in enumerate(doc.sents):
            words_postags = [[token.text, token.pos_] for token in sent]
            words = [token.text for token in sent]
            postags = [token.pos_ for token in sent]
            ents = nlp(sent.text).ents  # NER detection
            collected_ners = self.collect_ners(ents)

            if collected_ners:  # only extract triples when the sentence contains 'PERSON', 'ORG', 'GPE'
                triple = self.extract_triples(sent)
                if not triple:
                    continue
                triples += triple
                ners += collected_ners
                ner_sents.append(
                    [token.text + '/' + token.label_ for token in sent.ents])

        # 03 get keywords
        keywords = [i[0] for i in self.extract_keywords(words_postags)]
        for keyword in keywords:
            name = keyword
            cate = 'keyword'
            events.append([name, cate])

        # 04 add triples to event only the word in keyword
        for t in triples:
            if (t[0] in keywords or t[1] in keywords) and len(t[0]) > 1 and len(t[1]) > 1:
                events.append([t[0], t[1]])

        # 05 get word frequency and add to events
        word_dict = [i for i in Counter([i[0] for i in words_postags if i[1] in [
                                        'NOUN', 'PROPN', 'VERB'] and len(i[0]) > 1]).most_common()][:10]
        for wd in word_dict:
            name = wd[0]
            cate = 'frequency'
            events.append([name, cate])

        # 06 get NER from whole article
        ner_dict = {i[0]: i[1] for i in Counter(ners).most_common(20)}
        for ner in ner_dict:
            name = ner.split('/')[0]  # Jessica Miller
            cate = self.ner_dict[ner.split('/')[1]]  # PERSON
            events.append([name, cate])

        # 07 get all NER entity co-occurrence information
        # here ner_dict is from above 06
        co_dict = self.collect_coexist(ner_sents, list(ner_dict.keys()))
        co_events = [[i.split('@')[0].split(
            '/')[0], i.split('@')[1].split('/')[0]] for i in co_dict]
        events += co_events

        # 08 show event graph
        self.graph_shower.create_page(events)
