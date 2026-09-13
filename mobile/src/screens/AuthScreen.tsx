import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Screen } from "../components/ui/Screen";
import { Text } from "../components/ui/Text";
import { useAuth } from "../features/auth/AuthProvider";
import type { RootStackParams } from "../navigation/RootNavigator";
import { theme } from "../theme";

export function AuthScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParams, "Login" | "Register">) {
  const registering = route.name === "Register";
  const { session, message } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (busy) return;
    if (
      !email.trim() ||
      !password ||
      (registering && (!name.trim() || password.length < 12))
    ) {
      setError(
        registering
          ? "Preenche todos os campos e usa pelo menos 12 caracteres na palavra-passe."
          : "Preenche o email e a palavra-passe.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      await session.signIn(
        {
          email: email.trim(),
          password,
          ...(registering ? { display_name: name.trim() } : {}),
        },
        registering,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Text variant="label" style={styles.accent}>
          FITNESS / TRACKER
        </Text>
        <Text variant="title" accessibilityRole="header">
          {registering ? "O primeiro passo\né teu." : "Bom ter-te\nde volta."}
        </Text>
        <Text muted>
          {registering
            ? "Cria a tua conta e dá espaço ao teu progresso."
            : "Entra na tua conta. Um treino de cada vez."}
        </Text>
      </View>
      <View style={styles.fields}>
        {registering && (
          <Input
            label="Nome"
            value={name}
            onChangeText={setName}
            autoComplete="name"
            textContentType="name"
            maxLength={80}
            editable={!busy}
          />
        )}
        <Input
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          maxLength={320}
          editable={!busy}
        />
        <Input
          label="Palavra-passe"
          password
          value={password}
          onChangeText={setPassword}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={registering ? "new-password" : "current-password"}
          textContentType={registering ? "newPassword" : "password"}
          hint={
            registering
              ? "Pelo menos 12 caracteres. Podes usar uma frase."
              : undefined
          }
          maxLength={128}
          returnKeyType="go"
          onSubmitEditing={() => void submit()}
          editable={!busy}
        />
      </View>
      {(error || message) && (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={styles.error}
        >
          {error || message}
        </Text>
      )}
      <Button
        label={registering ? "Criar conta" : "Entrar"}
        onPress={() => void submit()}
        loading={busy}
      />
      <Pressable
        accessibilityRole="button"
        disabled={busy}
        style={styles.link}
        onPress={() => navigation.navigate(registering ? "Login" : "Register")}
      >
        <Text style={styles.accent}>
          {registering
            ? "Já tens conta? Entrar"
            : "Ainda não tens conta? Criar conta"}
        </Text>
      </Pressable>
      <Text muted style={styles.footer}>
        O teu espaço para treinar com consistência.
      </Text>
    </Screen>
  );
}
const styles = StyleSheet.create({
  header: {
    gap: theme.space.lg,
    paddingTop: theme.space.xxl,
    paddingBottom: theme.space.lg,
  },
  fields: { gap: theme.space.lg },
  accent: { color: theme.colors.accent },
  error: { color: theme.colors.error },
  link: {
    minHeight: theme.minTouchTarget,
    justifyContent: "center",
    alignItems: "center",
  },
  footer: { textAlign: "center" },
});
