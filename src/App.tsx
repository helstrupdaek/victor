import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { HomePage } from '@/pages/HomePage'
import { AdminPage } from '@/pages/admin/AdminPage'
import { WishPage } from '@/pages/WishPage'
import { MinigolfPage } from '@/pages/MinigolfPage'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/wish" element={<WishPage />} />
        <Route path="/minigolf" element={<MinigolfPage />} />
      </Routes>
    </BrowserRouter>
  )
}
