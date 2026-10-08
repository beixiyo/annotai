/** 官网页面组合：单页 landing，锚点导航 */
import { Faq } from './sections/Faq'
import { Features } from './sections/Features'
import { Header } from './sections/Header'
import { Hero } from './sections/Hero'
import { QuickStart } from './sections/QuickStart'

export function App() {
  return (
    <div class="min-h-dvh">
      <Header />
      <main>
        <Hero />
        <Features />
        <QuickStart />
        <Faq />
      </main>
    </div>
  )
}
