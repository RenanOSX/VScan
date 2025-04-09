import React, { Component } from 'react'
import { Stack } from 'expo-router'

export class InitialLayout extends Component {
  render() {
    return <Stack screenOptions={{headerShown: false}}/>
  }
}

export default InitialLayout