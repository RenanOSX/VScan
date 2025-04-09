import InitialLayout from "@/components/InitialLayout";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: "black" }}>
        <InitialLayout />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
