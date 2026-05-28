import { createApp } from 'vue'

import './app.scss'

const App = createApp({
  onShow(options) {
    console.log('App onShow.')
  },
})

export default App
