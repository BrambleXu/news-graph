# News Graph

Key information extration from text and graph visilization. Inspired by [TextGrapher](https://github.com/liuhuanyong/TextGrapher).

# Project Introduction

How to represent a text in a simple way is a chanllenge topic. This peoject try to extraction key information from the text by NLP methods, which contain NER extraction, relation detection, keywords extraction, frequencies words extraction. And finally show the key information in a graph way.

# How to use

```python
from news_graph import NewsMining
content = 'Input you text here'
Miner = NewsMining()
Miner.main(content)
```

This will generate the `graph.html`. 

# Example Demo

1) [Blockbuster *The Wandering Earth*](https://www.theverge.com/2019/2/9/18218479/the-wandering-earth-review-film-china-first-science-fiction-blockbuster-cixin-liu-gravity-the-core)
![image1](https://ws4.sinaimg.cn/large/006tNc79gy1g02ikc4mqjj30n60ot42a.jpg)

2) [Tokyo Marathon 2019 Elite Field](https://www.marathon.tokyo/en/news/detail/news_001178.html)
![image](https://user-images.githubusercontent.com/10768193/83982855-d4c93000-a964-11ea-86d8-1dd19f7d5334.png)
)

3) [EVEN ANONYMOUS CODERS LEAVE FINGERPRINTS](https://www.wired.com/story/machine-learning-identify-anonymous-code/?utm_campaign=Deep%20Learning%20Weekly&utm_medium=email&utm_source=Revue%20newsletter)
![image3](https://ws3.sinaimg.cn/large/006tNc79gy1g02hulrjx8j30i00pvjuv.jpg)
