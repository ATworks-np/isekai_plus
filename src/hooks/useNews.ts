import { useEffect, useState } from 'react'
import { collection, getDocs, orderBy, query, limit } from "firebase/firestore";
import { db } from "@/firebase";

interface NewsItem {
  id: string;
  name: string;
  body: string;
  created_at: Date;
}

const useNews = () => {
  const [latestNews, setLatestNews] = useState<NewsItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLatestNews = async () => {
      try {
        setLoading(true);
        // Create a query to get the latest news item
        const newsQuery = query(
          collection(db, 'versions/1/news'),
          orderBy('created_at', 'desc'),
          limit(1)
        );
        
        const querySnapshot = await getDocs(newsQuery);
        
        if (!querySnapshot.empty) {
          const doc = querySnapshot.docs[0];
          const data = doc.data();
          
          setLatestNews({
            id: doc.id,
            name: data.name || '',
            body: data.body || '',
            created_at: data.created_at?.toDate() || new Date(),
          });
        } else {
          setLatestNews(null);
        }
      } catch (err) {
        console.error("Error fetching news:", err);
        setError("Failed to fetch news");
      } finally {
        setLoading(false);
      }
    };

    fetchLatestNews();
  }, []);

  return { latestNews, loading, error };
};

export default useNews;